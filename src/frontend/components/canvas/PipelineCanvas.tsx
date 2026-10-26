'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Node,
  Edge,
  MarkerType,
  NodeMouseHandler,
  NodeTypes,
  EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { MidasNodeData, MidasNodeSubtype, MidasNodeType, NodeStatus } from '@/types/canvas';
import { TelemetryEventPayload, extractTelemetryRate } from '@/types/telemetry';
import { useTelemetryStream } from '@/hooks/useTelemetryStream';
import { useTimeTravel } from '@/hooks/useTimeTravel';
import { TimeTravelScrubber } from './TimeTravelScrubber';
import { TimeTravelMode, PipelineSnapshot } from '@/types/timeTravel';
import { HistoricalSnapshotStore } from '@/services/historicalTelemetryService';
import { NEW_GOLD_NODE_EVENT_TYPE } from '@/services/telemetryHistoryApi';
import { SourceNode } from './nodes/SourceNode';
import { StageNode } from './nodes/StageNode';
import { GuardianNode } from './nodes/GuardianNode';
import { DataFlowEdge } from './edges/DataFlowEdge';
import { CanvasControls } from './CanvasControls';
import { NodeInspectionDrawer } from './NodeInspectionDrawer';
import { TelemetryConnectionBanner } from './TelemetryConnectionBanner';
import { INITIAL_CANVAS_NODES, INITIAL_CANVAS_EDGES } from './topology/initialTopology';
import { PROFILES, type SecurityNodePolicy, type ZeroTrustRole } from '@/components/security/ZeroTrustLens';

const NODE_TYPES: NodeTypes = {
  source: SourceNode as unknown as React.ComponentType<any>,
  stage: StageNode as unknown as React.ComponentType<any>,
  guardian: GuardianNode as unknown as React.ComponentType<any>,
};

const EDGE_TYPES: EdgeTypes = {
  dataflow: DataFlowEdge as unknown as React.ComponentType<any>,
};

/**
 * Alias canónico de identificadores de nodo. El catálogo de identidades del
 * backend nombra `source_csv` a la fuente tabular; la topología del frontend la
 * llama `source_excel`. Es la única traducción admitida.
 */
const NODE_ID_ALIASES: Record<string, string> = {
  source_csv: 'source_excel',
};

const CANONICAL_NODE_IDS = new Set<string>(INITIAL_CANVAS_NODES.map((node) => node.id));

/** Posiciones fijas de columnas por capa Medallion canónica. */
const COLUMN_X_COORDINATES: Record<string, number> = {
  source: 40,
  generic: 40,
  bronze: 400,
  silver: 760,
  guardian: 760,
  gold: 1120,
};

function getColumnNodePosition(
  subType: MidasNodeSubtype,
  currentNodes: Node<MidasNodeData>[],
  fallbackIndex: number,
): { x: number; y: number } {
  const colX = COLUMN_X_COORDINATES[subType] ?? 40;
  const nodesInCol = currentNodes.filter((n) => Math.abs(n.position.x - colX) < 80);
  if (nodesInCol.length === 0) {
    return { x: colX, y: colX === 40 ? 60 : 240 };
  }
  const maxY = nodesInCol.reduce((max, n) => Math.max(max, n.position.y), 0);
  return { x: colX, y: maxY + 180 };
}

/** Banda inferior donde se ubican los nodos de respaldo. */
const DYNAMIC_NODE_ORIGIN = { x: 40, y: 620 };
const DYNAMIC_NODE_STEP = { x: 340, y: 190 };

/**
 * Padre canónico en la cadena Medallion del que nace un nodo dinámico.
 * El backend **no** emite eventos de conexión: la arista se deriva.
 */
const LAYER_PARENT_BY_SUBTYPE: Partial<Record<MidasNodeSubtype, string>> = {
  gold: 'silver_cleansing',
  silver: 'bronze_raw',
};

function dynamicNodePosition(index: number): { x: number; y: number } {
  return {
    x: DYNAMIC_NODE_ORIGIN.x + DYNAMIC_NODE_STEP.x * (index % 3),
    y: DYNAMIC_NODE_ORIGIN.y + DYNAMIC_NODE_STEP.y * Math.floor(index / 3),
  };
}

interface DynamicNodeShape {
  nodeType: MidasNodeType;
  subType: MidasNodeSubtype;
  label: string;
  catalogTable?: string;
}

/**
 * Deduce la forma de un nodo a partir del contrato real del evento.
 * Devuelve `null` cuando el `node_id` no pertenece a ningún namespace de capa
 * conocido: en ese caso el evento **no** se dibuja (pero sí queda registrado en
 * el historial y se propaga a `onTelemetryEvent`).
 */
export function inferDynamicNodeShape(
  nodeId: string,
  event: TelemetryEventPayload,
): DynamicNodeShape | null {
  const outputTable =
    typeof event.details?.output_table === 'string' && event.details.output_table.length > 0
      ? event.details.output_table
      : undefined;
  const isGoldAnnouncement = event.details?.event_type === NEW_GOLD_NODE_EVENT_TYPE;
  const normalized = nodeId.toLowerCase();
  const table = (outputTable ?? nodeId).toLowerCase();

  if (isGoldAnnouncement || table.startsWith('gold.') || normalized.startsWith('gold.')) {
    return {
      nodeType: 'stage',
      subType: 'gold',
      label: outputTable ?? nodeId,
      catalogTable: outputTable,
    };
  }
  if (normalized.startsWith('silver')) {
    return {
      nodeType: 'stage',
      subType: 'silver',
      label: outputTable ?? nodeId,
      catalogTable: outputTable,
    };
  }
  if (normalized.startsWith('bronze')) {
    return {
      nodeType: 'stage',
      subType: 'bronze',
      label: outputTable ?? nodeId,
      catalogTable: outputTable,
    };
  }
  if (normalized.startsWith('guardian')) {
    return { nodeType: 'guardian', subType: 'guardian', label: outputTable ?? nodeId };
  }
  if (normalized.startsWith('source')) {
    return { nodeType: 'source', subType: 'generic', label: outputTable ?? nodeId };
  }
  return null;
}

export interface PipelineCanvasProps {
  initialNodes?: Node<MidasNodeData>[];
  initialEdges?: Edge[];
  onNodeSelect?: (nodeData: MidasNodeData | null) => void;
  onTopologyChange?: (nodes: Node<MidasNodeData>[], edges: Edge[]) => void;
  className?: string;
  securityRole?: ZeroTrustRole;
  /**
   * Política de acceso por nodo publicada por el catálogo de identidades del
   * backend (`GET /api/v1/auth/roles`). Cuando está presente es la fuente de
   * verdad de la atenuación visual.
   */
  securityPolicy?: SecurityNodePolicy | null;
  sseUrl?: string;
  autoConnectSSE?: boolean;
  eventSourceFactory?: (url: string) => EventSource;
  onTelemetryEvent?: (event: TelemetryEventPayload) => void;
  timeTravelStore?: HistoricalSnapshotStore;
  initialTimeTravelMode?: TimeTravelMode;
  onTimeTravelModeChange?: (mode: TimeTravelMode) => void;
  onSnapshotChange?: (snapshot: PipelineSnapshot | null) => void;
}

export const PipelineCanvasInner: React.FC<PipelineCanvasProps> = ({
  initialNodes = INITIAL_CANVAS_NODES,
  initialEdges = INITIAL_CANVAS_EDGES,
  onNodeSelect,
  onTopologyChange,
  className = '',
  securityRole = 'admin',
  securityPolicy = null,
  sseUrl,
  autoConnectSSE = true,
  eventSourceFactory,
  onTelemetryEvent,
  timeTravelStore,
  initialTimeTravelMode = 'LIVE',
  onTimeTravelModeChange,
  onSnapshotChange,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<MidasNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeData, setSelectedNodeData] = useState<MidasNodeData | null>(null);

  // Derivación reactiva del nodo seleccionado para el Drawer de inspección en vivo
  const activeSelectedNode = useMemo(() => {
    if (!selectedNodeData) return null;
    const live = nodes.find((n) => n.id === selectedNodeData.id);
    return live ? live.data : selectedNodeData;
  }, [nodes, selectedNodeData]);

  // Sincronización reactiva con la sesión activa (HU-FRONT-07 / ADR-010)
  useEffect(() => {
    if (initialNodes && initialNodes.length > 0) {
      setNodes((current) => {
        // Prevenir degradación a 'N/D': si los nodos actuales ya tienen métricas calculadas
        // y los nodos entrantes vienen en STANDBY o sin métricas, fusionar preservando el conteo real.
        const hasCurrentMetrics = current.some((n) => typeof n.data?.recordsIn === 'number' && n.data.recordsIn > 0);
        const hasIncomingMetrics = initialNodes.some((n) => typeof n.data?.recordsIn === 'number' && n.data.recordsIn > 0);

        if (hasCurrentMetrics && !hasIncomingMetrics) {
          return initialNodes.map((initNode) => {
            const curr = current.find((c) => c.id === initNode.id);
            if (curr && typeof curr.data?.recordsIn === 'number') {
              return {
                ...initNode,
                data: {
                  ...initNode.data,
                  status: curr.data.status,
                  recordsIn: curr.data.recordsIn,
                  recordsOut: curr.data.recordsOut,
                  quarantinedRecords: curr.data.quarantinedRecords,
                  details: {
                    ...(initNode.data.details || {}),
                    ...(curr.data.details || {}),
                  },
                },
              };
            }
            return initNode;
          });
        }
        return initialNodes;
      });
    }
  }, [initialNodes, setNodes]);

  useEffect(() => {
    if (initialEdges) {
      setEdges(initialEdges);
    }
  }, [initialEdges, setEdges]);

  /**
   * HU-FRONT-08: la política de acceso por nodo proviene del catálogo de
   * identidades del backend. El hardcode local queda como **respaldo declarado**
   * para cuando el Gateway no está disponible.
   */
  const isNodeMasked = useCallback(
    (node: Node<MidasNodeData>) => {
      if (securityPolicy) {
        const locked = securityPolicy.lockedNodes.map((id) => NODE_ID_ALIASES[id] ?? id);
        if (locked.includes(node.id)) return true;

        const allowed = securityPolicy.allowedNodes.map((id) => NODE_ID_ALIASES[id] ?? id);
        if (
          allowed.length > 0 &&
          !allowed.includes(node.id) &&
          CANONICAL_NODE_IDS.has(node.id)
        ) {
          return true;
        }
        return false;
      }

      // Respaldo local declarado (identidades sin catálogo disponible).
      const role = securityRole;
      if (role === 'admin') return false;

      const restrictedIds = ['source_postgres', 'source_api', 'silver_cleansing', 'gold_marts'];
      const restrictedStages = ['silver', 'gold'];

      if (role === 'rbac') {
        if (restrictedIds.includes(node.id)) return true;
        if (node.data?.subType && restrictedStages.includes(String(node.data.subType))) return true;
      }

      if (role === 'compliance') {
        if (node.id === 'source_api' || node.id === 'gold_marts') return true;
        if (node.data?.subType === 'gold') return true;
      }

      return false;
    },
    [securityRole, securityPolicy]
  );

  // Time-Travel Replay Engine (HU-FRONT-03)
  const timeTravel = useTimeTravel({
    store: timeTravelStore,
    initialMode: initialTimeTravelMode,
    onModeChange: onTimeTravelModeChange,
    onSnapshotChange,
  });

  // Queue of events for 60 FPS requestAnimationFrame batching
  const pendingEventsRef = useRef<TelemetryEventPayload[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  selectedNodeIdRef.current = selectedNodeData?.id || null;

  // HU-FRONT-08: ids de evento ya procesados. El replay por `Last-Event-ID`
  // puede reenviar eventos: un `event_id` repetido no debe duplicar nodos,
  // aristas ni métricas.
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const nodesRef = useRef<Node<MidasNodeData>[]>(initialNodes);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Flush batched telemetry updates to React Flow nodes and edges in a single frame
  const flushBatchUpdates = useCallback(() => {
    rafIdRef.current = null;
    const batch = pendingEventsRef.current;
    if (batch.length === 0) return;

    // Drain the queue
    pendingEventsRef.current = [];

    // Map latest event per node_id in this frame
    const latestEventsByNode = new Map<string, TelemetryEventPayload>();
    for (const evt of batch) {
      latestEventsByNode.set(evt.node_id, evt);
    }

    // --- HU-FRONT-08: nodos y aristas debutados en caliente -------------------
    const knownNodeIds = new Set(nodesRef.current.map((node) => node.id));
    const dynamicNodes: Node<MidasNodeData>[] = [];
    const dynamicEdges: Edge[] = [];
    const dynamicOffset = nodesRef.current.filter((node) => !CANONICAL_NODE_IDS.has(node.id)).length;

    for (const [nodeId, evt] of latestEventsByNode) {
      if (knownNodeIds.has(nodeId)) continue;

      const shape = inferDynamicNodeShape(nodeId, evt);
      if (!shape) continue;

      dynamicNodes.push({
        id: nodeId,
        type: shape.nodeType,
        position: getColumnNodePosition(
          shape.subType,
          [...nodesRef.current, ...dynamicNodes],
          dynamicOffset + dynamicNodes.length,
        ),
        data: {
          id: nodeId,
          label: shape.label,
          description: `Nodo recibido en caliente desde el Hub de telemetría (${
            evt.pipeline_id || 'pipeline'
          }).`,
          nodeType: shape.nodeType,
          subType: shape.subType,
          status: evt.status ?? 'UNKNOWN',
          recordsIn: evt.records_in,
          recordsOut: evt.records_out,
          latencyMs: evt.latency_ms,
          lastUpdated: evt.timestamp,
          ...(shape.catalogTable
            ? { catalogTable: shape.catalogTable, storagePath: shape.catalogTable }
            : {}),
        },
      });
      knownNodeIds.add(nodeId);

      // Arista derivada de la cadena Medallion canónica (el backend no emite
      // eventos de conexión). Sólo si el nodo padre ya está en el grafo.
      const parent = LAYER_PARENT_BY_SUBTYPE[shape.subType];
      if (parent && knownNodeIds.has(parent)) {
        dynamicEdges.push({
          id: `edge_${parent}_${nodeId}`,
          source: parent,
          target: nodeId,
          type: 'dataflow',
          animated: true,
          style:
            shape.subType === 'gold'
              ? { stroke: '#B8860B', strokeWidth: 2 }
              : { stroke: '#3B82F6', strokeWidth: 1.5 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: shape.subType === 'gold' ? '#B8860B' : '#3B82F6',
          },
          data: {
            label: shape.subType === 'gold' ? 'WAP Promotion' : 'Dataflow',
            volume: evt.records_out,
            status: evt.status ?? 'UNKNOWN',
            ...(shape.subType === 'gold' ? { isWap: true } : {}),
          },
        });
      } else if (
        (shape.nodeType === 'source' || shape.subType === 'generic') &&
        knownNodeIds.has('bronze_raw')
      ) {
        dynamicEdges.push({
          id: `edge_${nodeId}_bronze_raw`,
          source: nodeId,
          target: 'bronze_raw',
          type: 'dataflow',
          animated: true,
          style: { stroke: '#2563EB', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#2563EB' },
          data: {
            label: 'Ingesta',
            volume: evt.records_out,
            status: evt.status ?? 'UNKNOWN',
          },
        });
      }
    }

    // 1. Update Nodes immutably
    setNodes((currentNodes) => {
      const updated = currentNodes.map((node) => {
        const evt = latestEventsByNode.get(node.id);
        if (!evt) return node;

        const quarantined =
          typeof evt.details?.quarantined_records === 'number'
            ? evt.details.quarantined_records
            : node.data.quarantinedRecords;

        const updatedData: MidasNodeData = {
          ...node.data,
          status: evt.status || node.data.status,
          recordsIn: evt.records_in !== undefined ? evt.records_in : node.data.recordsIn,
          recordsOut: evt.records_out !== undefined ? evt.records_out : node.data.recordsOut,
          latencyMs: evt.latency_ms !== undefined ? evt.latency_ms : node.data.latencyMs,
          lastUpdated: evt.timestamp || new Date().toISOString(),
          quarantinedRecords: quarantined,
        };

        if (node.id === 'guardian_monitor' && (evt.details || node.data.guardianDetails)) {
          updatedData.guardianDetails = {
            ...node.data.guardianDetails,
            playbook_id: (evt.details?.playbook_id as string) || node.data.guardianDetails?.playbook_id,
            action_taken: (evt.details?.action_taken as string) || node.data.guardianDetails?.action_taken,
            quarantined_records: quarantined,
            message: (evt.details?.message as string) || node.data.guardianDetails?.message,
            anomaly_type: (evt.details?.anomaly_type as any) || node.data.guardianDetails?.anomaly_type,
          };
        }

        // If this node is currently open in the inspection drawer, sync it live
        if (selectedNodeIdRef.current === node.id) {
          setSelectedNodeData(updatedData);
        }

        return {
          ...node,
          data: updatedData,
        };
      });

      // Los nodos debutados se AÑADEN: los preexistentes se conservan.
      return dynamicNodes.length > 0 ? [...updated, ...dynamicNodes] : updated;
    });

    // 2. Update Edges immutably (particle speed / recordsPerSecond & labels)
    setEdges((currentEdges) => {
      const updated = currentEdges.map((edge) => {
        let updatedEdge = edge;
        let matched = false;

        // PostgreSQL CRM -> Bronze Raw (Airflow)
        if (edge.id === 'edge_postgres_bronze' && latestEventsByNode.has('source_postgres')) {
          matched = true;
          const evt = latestEventsByNode.get('source_postgres')!;
          const rate = extractTelemetryRate(evt);
          updatedEdge = {
            ...edge,
            data: {
              ...edge.data,
              volume: evt.records_out,
              recordsPerSecond: rate,
              label: `${rate.toLocaleString()} filas/s`,
            },
          };
        }

        // Excel -> Bronze Raw (Airflow)
        if (edge.id === 'edge_excel_bronze' && latestEventsByNode.has('source_excel')) {
          matched = true;
          const evt = latestEventsByNode.get('source_excel')!;
          const rate = extractTelemetryRate(evt);
          updatedEdge = {
            ...edge,
            data: {
              ...edge.data,
              volume: evt.records_out,
              recordsPerSecond: rate,
              label: `${rate.toLocaleString()} filas/s`,
            },
          };
        }

        // API Webhooks -> Bronze Raw (Airflow)
        if (edge.id === 'edge_api_bronze' && latestEventsByNode.has('source_api')) {
          matched = true;
          const evt = latestEventsByNode.get('source_api')!;
          const rate = extractTelemetryRate(evt);
          updatedEdge = {
            ...edge,
            data: {
              ...edge.data,
              volume: evt.records_out,
              recordsPerSecond: rate,
              label: `${rate.toLocaleString()} filas/s`,
            },
          };
        }

        // Bronze Raw -> Silver Cleanse (PySpark Cleanse)
        if (
          edge.id === 'edge_bronze_silver' &&
          (latestEventsByNode.has('silver_cleansing') || latestEventsByNode.has('bronze_raw'))
        ) {
          matched = true;
          const evt =
            latestEventsByNode.get('silver_cleansing') || latestEventsByNode.get('bronze_raw')!;
          const rate = extractTelemetryRate(evt);
          updatedEdge = {
            ...edge,
            data: {
              ...edge.data,
              volume: evt.records_in || evt.records_out,
              recordsPerSecond: rate,
              label: `PySpark Cleanse (${rate.toLocaleString()} RPS)`,
            },
          };
        }

        // Silver Cleanse -> Gold Marts (PySpark WAP Promotion)
        if (
          edge.id === 'edge_silver_gold' &&
          (latestEventsByNode.has('gold_marts') || latestEventsByNode.has('silver_cleansing'))
        ) {
          matched = true;
          const evt =
            latestEventsByNode.get('gold_marts') || latestEventsByNode.get('silver_cleansing')!;
          const rate = extractTelemetryRate(evt);
          updatedEdge = {
            ...edge,
            data: {
              ...edge.data,
              volume: evt.records_out,
              recordsPerSecond: rate,
              label: `WAP Promotion (${rate.toLocaleString()} RPS)`,
            },
          };
        }

        // Silver Cleanse -> Guardian Monitor (Cuarentena)
        if (
          edge.id === 'edge_silver_guardian' &&
          (latestEventsByNode.has('silver_cleansing') || latestEventsByNode.has('guardian_monitor'))
        ) {
          matched = true;
          const evt =
            latestEventsByNode.get('guardian_monitor') || latestEventsByNode.get('silver_cleansing')!;
          const qRec =
            typeof evt.details?.quarantined_records === 'number'
              ? evt.details.quarantined_records
              : 0;

          updatedEdge = {
            ...edge,
            data: {
              ...edge.data,
              volume: qRec,
              recordsPerSecond: qRec,
              status: qRec > 0 ? 'DEGRADED' : 'HEALTHY',
              label: `${qRec} en Cuarentena`,
            },
          };
        }

        // Aristas dinámicas (no contempladas por la topología canónica): se
        // animan con la telemetría real del nodo de destino.
        if (!matched) {
          const evt =
            latestEventsByNode.get(edge.target) ?? latestEventsByNode.get(edge.source);
          if (evt) {
            const rate = extractTelemetryRate(evt);
            updatedEdge = {
              ...edge,
              data: {
                ...edge.data,
                volume: evt.records_out,
                recordsPerSecond: rate,
                label: `${rate.toLocaleString()} filas/s`,
              },
            };
          }
        }

        return updatedEdge;
      });

      // Las aristas derivadas se AÑADEN (id determinista → idempotente).
      const existingEdgeIds = new Set(updated.map((edge) => edge.id));
      const added = dynamicEdges.filter((edge) => !existingEdgeIds.has(edge.id));
      return added.length > 0 ? [...updated, ...added] : updated;
    });
  }, [setNodes, setEdges]);

  // Handler for each incoming telemetry event: buffers in store & queues for rAF
  const handleIncomingTelemetry = useCallback(
    (event: TelemetryEventPayload) => {
      // HU-FRONT-08: deduplicación por `event_id`. El replay por `Last-Event-ID`
      // puede reenviar eventos ya procesados: no deben duplicar nodos ni aristas.
      if (event.event_id) {
        if (seenEventIdsRef.current.has(event.event_id)) {
          return;
        }
        seenEventIdsRef.current.add(event.event_id);
        if (seenEventIdsRef.current.size > 2000) {
          const recent = Array.from(seenEventIdsRef.current).slice(-1000);
          seenEventIdsRef.current = new Set(recent);
        }
      }

      // 1. Background event buffering into history store (AC-02, AC-03)
      timeTravel.recordLiveTelemetry(event);

      // 2. Only push to active canvas visual queue if in LIVE mode
      if (timeTravel.mode === 'LIVE') {
        pendingEventsRef.current.push(event);

        if (rafIdRef.current === null && typeof window !== 'undefined') {
          rafIdRef.current = requestAnimationFrame(flushBatchUpdates);
        }
      }

      if (onTelemetryEvent) {
        onTelemetryEvent(event);
      }
    },
    [flushBatchUpdates, onTelemetryEvent, timeTravel]
  );

  // Effect: Apply active historical snapshot to nodes and edges in REPLAY mode (AC-03)
  useEffect(() => {
    if (timeTravel.mode !== 'REPLAY' || !timeTravel.activeSnapshot) {
      return;
    }

    const snap = timeTravel.activeSnapshot;

    // 1. Reconstruct nodes according to snapshot
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const snapNode = snap.nodesState[node.id];
        if (!snapNode) return node;

        const updatedData: MidasNodeData = {
          ...node.data,
          status: snapNode.status,
          recordsIn: snapNode.recordsIn,
          recordsOut: snapNode.recordsOut,
          latencyMs: snapNode.latencyMs ?? node.data.latencyMs,
          lastUpdated: snap.timestamp,
          quarantinedRecords: snapNode.quarantinedRecords ?? 0,
          guardianDetails: snapNode.guardianDetails || node.data.guardianDetails,
        };

        if (selectedNodeIdRef.current === node.id) {
          setSelectedNodeData(updatedData);
        }

        return {
          ...node,
          data: updatedData,
        };
      })
    );

    // 2. Reconstruct edge flow rates and quarantine state
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        let updatedEdge = edge;

        if (edge.id === 'edge_bronze_silver') {
          const rate = snap.sparkRps ?? 350;
          updatedEdge = {
            ...edge,
            data: {
              ...edge.data,
              volume: snap.recordsProcessed,
              recordsPerSecond: rate,
              label: `PySpark Cleanse (${rate.toLocaleString()} RPS)`,
            },
          };
        } else if (edge.id === 'edge_silver_gold') {
          const rate = snap.sparkRps ?? 350;
          updatedEdge = {
            ...edge,
            data: {
              ...edge.data,
              volume: snap.recordsProcessed,
              recordsPerSecond: rate,
              label: `WAP Promotion (${rate.toLocaleString()} RPS)`,
            },
          };
        } else if (edge.id === 'edge_silver_guardian') {
          const qRec = snap.recordsQuarantined;
          updatedEdge = {
            ...edge,
            data: {
              ...edge.data,
              volume: qRec,
              recordsPerSecond: qRec,
              status: qRec > 0 ? 'DEGRADED' : 'HEALTHY',
              label: `${qRec} en Cuarentena`,
            },
          };
        }

        return updatedEdge;
      })
    );
  }, [timeTravel.mode, timeTravel.activeSnapshot, setNodes, setEdges]);

  // Effect: Instant restoration of latest live telemetry state when returning to LIVE (AC-02, AC-04)
  const prevModeRef = useRef<TimeTravelMode>('LIVE');
  useEffect(() => {
    if (prevModeRef.current === 'REPLAY' && timeTravel.mode === 'LIVE') {
      const latestSnap = timeTravel.availableSnapshots.slice(-1)[0];
      if (latestSnap) {
        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            const snapNode = latestSnap.nodesState[node.id];
            if (!snapNode) return node;

            const restoredData: MidasNodeData = {
              ...node.data,
              status: snapNode.status,
              recordsIn: snapNode.recordsIn,
              recordsOut: snapNode.recordsOut,
              latencyMs: snapNode.latencyMs ?? node.data.latencyMs,
              lastUpdated: latestSnap.timestamp,
              quarantinedRecords: snapNode.quarantinedRecords ?? 0,
              guardianDetails: snapNode.guardianDetails || node.data.guardianDetails,
            };

            if (selectedNodeIdRef.current === node.id) {
              setSelectedNodeData(restoredData);
            }

            return {
              ...node,
              data: restoredData,
            };
          })
        );
      }
    }
    prevModeRef.current = timeTravel.mode;
  }, [timeTravel.mode, timeTravel.availableSnapshots, setNodes]);

  // Subscribe to SSE stream
  const { connectionStatus, lastEvent, reconnectAttempts, connect } = useTelemetryStream({
    url: sseUrl,
    autoConnect: autoConnectSSE,
    eventSourceFactory,
    onEvent: handleIncomingTelemetry,
  });

  // Cleanup pending rAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null && typeof window !== 'undefined') {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // Manejador de selección de nodo
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const data = node.data as MidasNodeData;
      setSelectedNodeData(data);
      if (onNodeSelect) {
        onNodeSelect(data);
      }
    },
    [onNodeSelect]
  );

  // Deseleccionar al hacer clic en el lienzo vacío
  const handlePaneClick = useCallback(() => {
    setSelectedNodeData(null);
    if (onNodeSelect) {
      onNodeSelect(null);
    }
  }, [onNodeSelect]);

  // Restablecer posiciones originales (conservando los nodos dinámicos recibidos)
  const handleResetLayout = useCallback(() => {
    const dynamicNodes = nodes.filter((node) => !CANONICAL_NODE_IDS.has(node.id));
    const nextNodes = [...INITIAL_CANVAS_NODES, ...dynamicNodes];
    const canonicalEdgeIds = new Set(INITIAL_CANVAS_EDGES.map((edge) => edge.id));
    const dynamicEdges = edges.filter((edge) => !canonicalEdgeIds.has(edge.id));
    const nextEdges = [...INITIAL_CANVAS_EDGES, ...dynamicEdges];

    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeData(null);

    if (onTopologyChange) {
      onTopologyChange(nextNodes, nextEdges);
    }
  }, [nodes, edges, setNodes, setEdges, onTopologyChange]);

  const onNodeDragStop = useCallback(() => {
    if (onTopologyChange) {
      onTopologyChange(nodes, edges);
    }
  }, [nodes, edges, onTopologyChange]);

  // Contadores de salud de la topología
  const totalNodes = nodes.length;
  const healthyNodes = useMemo(
    () => nodes.filter((n) => n.data.status === 'HEALTHY' || n.data.status === 'RUNNING').length,
    [nodes]
  );

  const enhancedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const masked = isNodeMasked(node);

        return {
          ...node,
          data: {
            ...node.data,
            securityMask: masked ? { enabled: true, role: securityRole } : { enabled: false, role: securityRole },
          },
          style: {
            ...node.style,
            opacity: masked ? 0.3 : 1,
            filter: masked ? 'grayscale(0.25)' : 'none',
          },
        };
      }),
    [isNodeMasked, nodes, securityRole]
  );

  // Color de nodos para el MiniMap
  const nodeColor = useCallback((node: Node) => {
    const data = node.data as MidasNodeData;
    switch (data?.subType) {
      case 'bronze':
        return '#C86A43'; // Bronze terracotta
      case 'silver':
        return '#64748B'; // Slate silver
      case 'gold':
        return '#D4AF37'; // Gold
      case 'guardian':
        return '#A8422B'; // Guardian deep terracotta
      default:
        return '#787164'; // Sources neutral slate
    }
  }, []);

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-[#FFFFFF] ${className}`}
      data-testid="pipeline-canvas-container"
    >
      {/* Controles de Cabecera Izquierda */}
      <CanvasControls
        totalNodes={totalNodes}
        healthyNodes={healthyNodes}
        onResetLayout={handleResetLayout}
      />

      {/* Banner Discreto de Estado de Conexión SSE Derecha */}
      <div className="absolute top-4 right-4 z-20">
        <TelemetryConnectionBanner
          status={connectionStatus}
          lastEventTime={lastEvent?.timestamp}
          reconnectAttempts={reconnectAttempts}
          onManualReconnect={connect}
        />
      </div>

      {/* Canvas React Flow */}
      <ReactFlow
        nodes={enhancedNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2.0}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.1} color="#E8E4DC" />
        <Controls
          className="!bottom-4 !left-4 !border-[#F0EDE7] !bg-[#FFFFFF] !fill-[#6B6557] [&>button]:!border-[#F0EDE7] [&>button]:!bg-[#FFFFFF] [&>button]:hover:!bg-[#FAFAFA] [&>button]:hover:!fill-[#1C1E21] shadow-sm rounded overflow-hidden"
          showInteractive={false}
        />
        <MiniMap
          nodeColor={nodeColor}
          nodeStrokeWidth={3}
          maskColor="rgba(255, 255, 255, 0.75)"
          className="!bottom-4 !right-24 !rounded !border !border-[#F0EDE7] !bg-[#FFFFFF] !shadow-sm"
        />
      </ReactFlow>

      {/* Barra de Replay Temporal e Inspección Histórica (HU-FRONT-03) */}
      <TimeTravelScrubber
        mode={timeTravel.mode}
        isPlaying={timeTravel.isPlaying}
        speed={timeTravel.speed}
        currentTimeMs={timeTravel.currentTimeMs}
        liveNowMs={timeTravel.liveNowMs}
        windowStartMs={timeTravel.windowStartMs}
        windowEndMs={timeTravel.windowEndMs}
        activeSnapshot={timeTravel.activeSnapshot}
        relativeOffsetMinutes={timeTravel.relativeOffsetMinutes}
        relativeOffsetLabel={timeTravel.relativeOffsetLabel}
        timelinePoints={timeTravel.timelinePoints}
        historyStatus={timeTravel.historyStatus}
        historyError={timeTravel.historyError}
        onPlay={timeTravel.play}
        onPause={timeTravel.pause}
        onTogglePlay={timeTravel.togglePlay}
        onSetSpeed={timeTravel.setSpeed}
        onSeek={timeTravel.seekTo}
        onReturnToLive={timeTravel.returnToLive}
      />

      {/* Panel Lateral de Inspección (Drawer) */}
      <NodeInspectionDrawer
        selectedNode={activeSelectedNode}
        onClose={() => setSelectedNodeData(null)}
        onPipelineExecuted={(res) => {
          if (res) {
            setNodes((current) => {
              const updatedNodes = current.map((n) => {
                if (n.id === selectedNodeData?.id || n.data.nodeType === 'source' || n.id.startsWith('source_')) {
                  const hasGold = (res.gold_records_generated ?? 0) > 0;
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      status: hasGold ? 'HEALTHY' : 'IN_PROGRESS',
                      recordsIn: res.records_ingested,
                      recordsOut: res.records_ingested,
                    },
                  };
                }
                if (n.id === 'bronze_raw') {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      status: 'HEALTHY',
                      recordsIn: res.records_ingested,
                      recordsOut: res.records_ingested,
                    },
                  };
                }
                if (n.id === 'silver_cleansing') {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      status: res.records_quarantined > 0 ? 'DEGRADED' : 'HEALTHY',
                      recordsIn: res.records_ingested,
                      recordsOut: res.records_cleaned,
                      quarantinedRecords: res.records_quarantined,
                    },
                  };
                }
                if (n.id === 'guardian_monitor' && res.records_quarantined > 0) {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      status: 'AUTO_HEALING',
                      recordsIn: res.records_quarantined,
                      quarantinedRecords: res.records_quarantined,
                    },
                  };
                }
                if (n.id === 'gold_marts') {
                  const hasGold = (res.gold_records_generated ?? 0) > 0;
                  const goldTbls = res.output_tables?.filter((t: string) => t.startsWith('gold.')) || [];
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      status: hasGold ? 'HEALTHY' : 'STANDBY',
                      label: hasGold
                        ? (goldTbls.length > 1 ? `Gold Marts (${goldTbls.length} Tablas)` : 'Gold Mart (Materializado)')
                        : 'Gold Marts (Por Definir)',
                      catalogTable: hasGold && goldTbls.length > 0 ? goldTbls.join(', ') : 'gold.personalizado',
                      recordsIn: hasGold ? res.records_cleaned : 0,
                      recordsOut: hasGold ? res.gold_records_generated : 0,
                      description: hasGold
                        ? `Capa Gold materializada y certificada en catálogo Iceberg: ${goldTbls.join(', ')}.`
                        : 'Marts y vistas analíticas personalizables. Interactúa con el Copiloto para crear tu capa Gold.',
                      details: {
                        ...n.data.details,
                        tables: goldTbls,
                        tables_count: goldTbls.length,
                        audit_status: 'Certificado WAP en catálogo Iceberg',
                      },
                    },
                  };
                }
                return n;
              });

              // Persistir topología con métricas reales al backend y contexto de sesión
              if (onTopologyChange) {
                onTopologyChange(updatedNodes, edges);
              }

              return updatedNodes;
            });
          }
        }}
      />

      {securityRole !== 'admin' && (
        <div
          data-testid="zero-trust-simulation-banner"
          className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center border-b border-[#D4AF37]/30 bg-[#FFFFFF]/90 px-3 py-1.5 text-[11px] text-[#1C1E21] backdrop-blur-md shadow-xs"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/50 bg-[#FBF8EF] px-2.5 py-0.5 font-mono text-[10px] font-medium text-[#8C6D1F]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#B8860B] animate-pulse" />
            Perfil de identidad: {securityPolicy?.title ?? PROFILES[securityRole]?.label ?? securityRole} ·{' '}
            {securityPolicy
              ? 'Política declarada por el catálogo de identidades'
              : 'Sin catálogo de identidades: política local de respaldo'}
          </span>
        </div>
      )}
    </div>
  );
};

export const PipelineCanvas: React.FC<PipelineCanvasProps> = (props) => (
  <ReactFlowProvider>
    <PipelineCanvasInner {...props} />
  </ReactFlowProvider>
);
