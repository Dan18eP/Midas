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
  NodeMouseHandler,
  NodeTypes,
  EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { MidasNodeData } from '@/types/canvas';
import { TelemetryEventPayload } from '@/types/telemetry';
import { useTelemetryStream } from '@/hooks/useTelemetryStream';
import { useTimeTravel } from '@/hooks/useTimeTravel';
import { TimeTravelScrubber } from './TimeTravelScrubber';
import { TimeTravelMode, PipelineSnapshot } from '@/types/timeTravel';
import { HistoricalSnapshotStore } from '@/services/historicalTelemetryService';
import { SourceNode } from './nodes/SourceNode';
import { StageNode } from './nodes/StageNode';
import { GuardianNode } from './nodes/GuardianNode';
import { DataFlowEdge } from './edges/DataFlowEdge';
import { CanvasControls } from './CanvasControls';
import { NodeInspectionDrawer } from './NodeInspectionDrawer';
import { TelemetryConnectionBanner } from './TelemetryConnectionBanner';
import { INITIAL_CANVAS_NODES, INITIAL_CANVAS_EDGES } from './topology/initialTopology';

const NODE_TYPES: NodeTypes = {
  source: SourceNode as unknown as React.ComponentType<any>,
  stage: StageNode as unknown as React.ComponentType<any>,
  guardian: GuardianNode as unknown as React.ComponentType<any>,
};

const EDGE_TYPES: EdgeTypes = {
  dataflow: DataFlowEdge as unknown as React.ComponentType<any>,
};

export interface PipelineCanvasProps {
  initialNodes?: Node<MidasNodeData>[];
  initialEdges?: Edge[];
  onNodeSelect?: (nodeData: MidasNodeData | null) => void;
  className?: string;
  sseUrl?: string;
  autoConnectSSE?: boolean;
  eventSourceFactory?: (url: string) => EventSource;
  onTelemetryEvent?: (event: TelemetryEventPayload) => void;
  timeTravelStore?: HistoricalSnapshotStore;
  initialTimeTravelMode?: TimeTravelMode;
  onTimeTravelModeChange?: (mode: TimeTravelMode) => void;
  onSnapshotChange?: (snapshot: PipelineSnapshot | null) => void;
}

function extractRate(event: TelemetryEventPayload): number {
  const details = event.details;
  if (details) {
    if (typeof details.throughput_rps === 'number' && details.throughput_rps >= 0) {
      return details.throughput_rps;
    }
    if (typeof details.records_per_second === 'number' && details.records_per_second >= 0) {
      return details.records_per_second;
    }
    if (typeof details.spark_rps === 'number' && details.spark_rps >= 0) {
      return details.spark_rps;
    }
    if (typeof details.airflow_rps === 'number' && details.airflow_rps >= 0) {
      return details.airflow_rps;
    }
  }
  if (event.latency_ms > 0 && event.records_out > 0) {
    return Math.round((event.records_out / event.latency_ms) * 1000);
  }
  return event.records_out;
}

export const PipelineCanvasInner: React.FC<PipelineCanvasProps> = ({
  initialNodes = INITIAL_CANVAS_NODES,
  initialEdges = INITIAL_CANVAS_EDGES,
  onNodeSelect,
  className = '',
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

    // 1. Update Nodes immutably
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
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
      })
    );

    // 2. Update Edges immutably (particle speed / recordsPerSecond & labels)
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        let updatedEdge = edge;

        // PostgreSQL CRM -> Bronze Raw (Airflow)
        if (edge.id === 'edge_postgres_bronze' && latestEventsByNode.has('source_postgres')) {
          const evt = latestEventsByNode.get('source_postgres')!;
          const rate = extractRate(evt);
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
          const evt = latestEventsByNode.get('source_excel')!;
          const rate = extractRate(evt);
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
          const evt = latestEventsByNode.get('source_api')!;
          const rate = extractRate(evt);
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
          const evt =
            latestEventsByNode.get('silver_cleansing') || latestEventsByNode.get('bronze_raw')!;
          const rate = extractRate(evt);
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
          const evt =
            latestEventsByNode.get('gold_marts') || latestEventsByNode.get('silver_cleansing')!;
          const rate = extractRate(evt);
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

        return updatedEdge;
      })
    );
  }, [setNodes, setEdges]);

  // Handler for each incoming telemetry event: buffers in store & queues for rAF
  const handleIncomingTelemetry = useCallback(
    (event: TelemetryEventPayload) => {
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

  // Restablecer posiciones originales
  const handleResetLayout = useCallback(() => {
    setNodes(INITIAL_CANVAS_NODES);
    setEdges(INITIAL_CANVAS_EDGES);
    setSelectedNodeData(null);
  }, [setNodes, setEdges]);

  // Contadores de salud de la topología
  const totalNodes = nodes.length;
  const healthyNodes = useMemo(
    () => nodes.filter((n) => n.data.status === 'HEALTHY' || n.data.status === 'RUNNING').length,
    [nodes]
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
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
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
        onPlay={timeTravel.play}
        onPause={timeTravel.pause}
        onTogglePlay={timeTravel.togglePlay}
        onSetSpeed={timeTravel.setSpeed}
        onSeek={timeTravel.seekTo}
        onReturnToLive={timeTravel.returnToLive}
      />

      {/* Panel Lateral de Inspección (Drawer) */}
      <NodeInspectionDrawer
        selectedNode={selectedNodeData}
        onClose={() => setSelectedNodeData(null)}
      />
    </div>
  );
};

export const PipelineCanvas: React.FC<PipelineCanvasProps> = (props) => (
  <ReactFlowProvider>
    <PipelineCanvasInner {...props} />
  </ReactFlowProvider>
);
