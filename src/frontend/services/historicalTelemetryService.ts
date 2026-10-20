/**
 * Midas Canvas — Historical Snapshot Store & Telemetry Replay Service
 * Compliant with HU-FRONT-03 (Time-Travel Replay Scrubber) and backend SSE contracts.
 */

import { NodeStatus } from '@/types/canvas';
import { TelemetryEventPayload } from '@/types/telemetry';
import {
  PipelineSnapshot,
  PipelineSnapshotNodeState,
  HistoricalTimelinePoint,
  HistoricalAlert,
} from '@/types/timeTravel';

/**
 * Creates a default base snapshot representing healthy normal operation (T0).
 */
export function createBaseNodesState(): Record<string, PipelineSnapshotNodeState> {
  return {
    source_postgres: {
      status: 'HEALTHY',
      recordsIn: 0,
      recordsOut: 4520,
      latencyMs: 12.4,
      alertsCount: 0,
      description: 'PostgreSQL CRM/ERP transacciones operacionales.',
    },
    source_excel: {
      status: 'HEALTHY',
      recordsIn: 0,
      recordsOut: 320,
      latencyMs: 8.1,
      alertsCount: 0,
      description: 'Excel Metas Presupuesto regional 2026.',
    },
    source_api: {
      status: 'HEALTHY',
      recordsIn: 0,
      recordsOut: 1850,
      latencyMs: 24.6,
      alertsCount: 0,
      description: 'API REST Webhooks de pasarelas de pago.',
    },
    bronze_raw: {
      status: 'HEALTHY',
      recordsIn: 6690,
      recordsOut: 6690,
      latencyMs: 45.2,
      alertsCount: 0,
      description: 'Bronze Raw inmutable en Apache Iceberg v2.',
    },
    silver_cleansing: {
      status: 'HEALTHY',
      recordsIn: 6690,
      recordsOut: 6690,
      latencyMs: 120.8,
      quarantinedRecords: 0,
      alertsCount: 0,
      description: 'Silver Cleanse con PySpark y Quality Gate.',
    },
    guardian_monitor: {
      status: 'HEALTHY',
      recordsIn: 0,
      recordsOut: 0,
      latencyMs: 15.0,
      quarantinedRecords: 0,
      alertsCount: 0,
      description: 'Midas Guardian en Standby (Monitoreo activo).',
      guardianDetails: {
        playbook_id: 'PB-03-QUARANTINE',
        action_taken: 'Standby - Monitoreando anomalías F1 a F5',
        quarantined_records: 0,
        message: 'Contrato WAP intacto. Gold protegida contra corrupción contable.',
      },
    },
    gold_marts: {
      status: 'HEALTHY',
      recordsIn: 6690,
      recordsOut: 6690,
      latencyMs: 85.3,
      alertsCount: 0,
      description: 'Gold Marts dimensionales certificados en Iceberg.',
    },
  };
}

/**
 * Builds canonical snapshots anchored along the 24-hour timeline relative to referenceNowMs.
 * Covers: T-24h (T0), T-12h (T0), T-2h (T0 Steady), T-45m (T1 Incident), T-25m (T2 Healing), T-5m (T3 Recovered), T-0m (Live Baseline).
 */
export function createCanonicalSnapshots(referenceNowMs: number = Date.now()): PipelineSnapshot[] {
  const HOUR = 60 * 60 * 1000;
  const MINUTE = 60 * 1000;

  // Snapshot 1: T-24h (T0 Baseline)
  const t24hMs = referenceNowMs - 24 * HOUR;
  const snap24h: PipelineSnapshot = {
    id: 'snap_t0_24h',
    timestamp: new Date(t24hMs).toISOString(),
    timestampMs: t24hMs,
    scenarioId: 'T0',
    stageLabel: 'Operación Normal (T-24h)',
    overallStatus: 'HEALTHY',
    recordsProcessed: 5000,
    recordsQuarantined: 0,
    recordsTotal: 5000,
    sparkRps: 350,
    airflowRps: 280,
    nodesState: createBaseNodesState(),
    activeAlerts: [],
    description: 'Arranque del ciclo diario. Ingesta normal en Bronze y Silver sin anomalías.',
  };

  // Snapshot 2: T-12h (T0 Medio día)
  const t12hMs = referenceNowMs - 12 * HOUR;
  const snap12h: PipelineSnapshot = {
    id: 'snap_t0_12h',
    timestamp: new Date(t12hMs).toISOString(),
    timestampMs: t12hMs,
    scenarioId: 'T0',
    stageLabel: 'Operación Normal (T-12h)',
    overallStatus: 'HEALTHY',
    recordsProcessed: 6200,
    recordsQuarantined: 0,
    recordsTotal: 6200,
    sparkRps: 380,
    airflowRps: 310,
    nodesState: createBaseNodesState(),
    activeAlerts: [],
    description: 'Corte de mediodía completado con 100% de contratos de esquema validados.',
  };

  // Snapshot 3: T-2h (T0 Pre-incidente)
  const t2hMs = referenceNowMs - 2 * HOUR;
  const snap2h: PipelineSnapshot = {
    id: 'snap_t0_2h',
    timestamp: new Date(t2hMs).toISOString(),
    timestampMs: t2hMs,
    scenarioId: 'T0',
    stageLabel: 'Operación Estable (T-2h)',
    overallStatus: 'HEALTHY',
    recordsProcessed: 6690,
    recordsQuarantined: 0,
    recordsTotal: 6690,
    sparkRps: 360,
    airflowRps: 290,
    nodesState: createBaseNodesState(),
    activeAlerts: [],
    description: 'Flujo estable antes del lote con transacciones internacionales.',
  };

  // Snapshot 4: T-45m (T1 - Incidente F3 detectado)
  const t45mMs = referenceNowMs - 45 * MINUTE;
  const nodesStateT1 = createBaseNodesState();
  nodesStateT1.silver_cleansing = {
    ...nodesStateT1.silver_cleansing,
    status: 'DEGRADED',
    recordsIn: 1200,
    recordsOut: 1186,
    latencyMs: 95.0,
    quarantinedRecords: 14,
    alertsCount: 1,
    description: '14 registros con montos negativos detectados en lote comercial.',
  };
  const alertT1: HistoricalAlert = {
    id: 'alt_f3_01',
    nodeId: 'silver_cleansing',
    severity: 'warning',
    message: 'Anomalía F3_NEGATIVE_AMOUNT: 14 registros violan contrato financiero de montos positivos.',
    timestamp: new Date(t45mMs).toISOString(),
  };
  const snapT1: PipelineSnapshot = {
    id: 'snap_t1_incident',
    timestamp: new Date(t45mMs).toISOString(),
    timestampMs: t45mMs,
    scenarioId: 'T1',
    stageLabel: 'Incidente F3 Detectado (T-45m)',
    overallStatus: 'DEGRADED',
    recordsProcessed: 1186,
    recordsQuarantined: 14,
    recordsTotal: 1200,
    sparkRps: 180,
    airflowRps: 290,
    nodesState: nodesStateT1,
    activeAlerts: [alertT1],
    description: 'Incidente inyectado: Silver detecta anomalía F3 y desvía 14 registros a cuarentena.',
  };

  // Snapshot 5: T-25m (T2 - Guardian Auto-Healing en acción)
  const t25mMs = referenceNowMs - 25 * MINUTE;
  const nodesStateT2 = { ...nodesStateT1 };
  nodesStateT2.guardian_monitor = {
    status: 'AUTO_HEALING',
    recordsIn: 14,
    recordsOut: 14,
    latencyMs: 18.0,
    quarantinedRecords: 14,
    alertsCount: 1,
    description: 'Playbook PB-03 aislando registros corruptos; capa Gold intacta.',
    guardianDetails: {
      playbook_id: 'PB-03-QUARANTINE',
      action_taken: 'quarantine_isolate_and_protect_gold',
      quarantined_records: 14,
      message: 'Playbook PB-03 aislando registros corruptos; capa Gold intacta.',
      anomaly_type: 'F3_NEGATIVE_AMOUNT',
    },
  };
  const alertT2: HistoricalAlert = {
    id: 'alt_pb03_01',
    nodeId: 'guardian_monitor',
    severity: 'warning',
    message: 'Midas Guardian ejecutando Playbook PB-03: Aislamiento preventivo y preservación de Gold.',
    timestamp: new Date(t25mMs).toISOString(),
  };
  const snapT2: PipelineSnapshot = {
    id: 'snap_t2_guardian',
    timestamp: new Date(t25mMs).toISOString(),
    timestampMs: t25mMs,
    scenarioId: 'T2',
    stageLabel: 'Guardian Auto-Healing (T-25m)',
    overallStatus: 'AUTO_HEALING',
    recordsProcessed: 1186,
    recordsQuarantined: 14,
    recordsTotal: 1200,
    sparkRps: 210,
    airflowRps: 290,
    nodesState: nodesStateT2,
    activeAlerts: [alertT2],
    description: 'Midas Guardian interviene: activa playbook PB-03 y aísla la corrupción antes de Gold.',
  };

  // Snapshot 6: T-5m (T3 - Recuperado y Publicado)
  const t5mMs = referenceNowMs - 5 * MINUTE;
  const nodesStateT3 = createBaseNodesState();
  nodesStateT3.silver_cleansing = {
    ...nodesStateT3.silver_cleansing,
    status: 'HEALTHY',
    recordsIn: 1186,
    recordsOut: 1186,
    latencyMs: 35.0,
    quarantinedRecords: 14,
    alertsCount: 0,
    description: 'Silver saneada. Cuarentena aislada en silver.pedidos_quarantine.',
  };
  nodesStateT3.gold_marts = {
    ...nodesStateT3.gold_marts,
    status: 'HEALTHY',
    recordsIn: 1186,
    recordsOut: 1186,
    latencyMs: 28.0,
    alertsCount: 0,
    description: 'Nuevo snapshot Iceberg 2002 publicado y certificado.',
  };
  nodesStateT3.guardian_monitor = {
    status: 'HEALTHY',
    recordsIn: 0,
    recordsOut: 0,
    latencyMs: 5.0,
    quarantinedRecords: 14,
    alertsCount: 0,
    description: 'Midas Guardian en Standby tras remediación exitosa.',
    guardianDetails: {
      playbook_id: 'PB-03-QUARANTINE',
      action_taken: 'Playbook completado con éxito',
      quarantined_records: 14,
      message: 'Capa Gold protegida y snapshot 2002 auditado.',
    },
  };
  const snapT3: PipelineSnapshot = {
    id: 'snap_t3_recovered',
    timestamp: new Date(t5mMs).toISOString(),
    timestampMs: t5mMs,
    scenarioId: 'T3',
    stageLabel: 'Recuperado & Publicado (T-5m)',
    overallStatus: 'HEALTHY',
    recordsProcessed: 1186,
    recordsQuarantined: 14,
    recordsTotal: 1200,
    sparkRps: 420,
    airflowRps: 300,
    nodesState: nodesStateT3,
    activeAlerts: [],
    description: 'Pipeline recuperado: nuevo snapshot Iceberg publicado, métricas en verde.',
  };

  // Snapshot 7: T-0m (Instante actual LIVE)
  const snapNow: PipelineSnapshot = {
    id: 'snap_live_now',
    timestamp: new Date(referenceNowMs).toISOString(),
    timestampMs: referenceNowMs,
    scenarioId: 'T0',
    stageLabel: 'En Vivo (LIVE)',
    overallStatus: 'HEALTHY',
    recordsProcessed: 6690,
    recordsQuarantined: 14,
    recordsTotal: 6704,
    sparkRps: 450,
    airflowRps: 320,
    nodesState: nodesStateT3,
    activeAlerts: [],
    description: 'Telemetría operacional en tiempo real conectada al SSE Hub.',
  };

  return [snap24h, snap12h, snap2h, snapT1, snapT2, snapT3, snapNow];
}

/**
 * HistoricalSnapshotStore manages the in-memory chronological timeline of snapshots.
 */
export class HistoricalSnapshotStore {
  private snapshots: PipelineSnapshot[] = [];
  private maxCapacity: number = 500;

  constructor(initialSnapshots?: PipelineSnapshot[]) {
    if (initialSnapshots && initialSnapshots.length > 0) {
      this.snapshots = [...initialSnapshots].sort((a, b) => a.timestampMs - b.timestampMs);
    } else {
      this.initialize();
    }
  }

  /**
   * Initializes store with canonical 24-hour timeline.
   */
  public initialize(referenceNowMs: number = Date.now()): void {
    this.snapshots = createCanonicalSnapshots(referenceNowMs);
  }

  /**
   * Appends or replaces a snapshot, keeping chronological sorting.
   */
  public addSnapshot(snapshot: PipelineSnapshot): void {
    const existingIndex = this.snapshots.findIndex((s) => s.id === snapshot.id);
    if (existingIndex >= 0) {
      this.snapshots[existingIndex] = snapshot;
    } else {
      this.snapshots.push(snapshot);
      this.snapshots.sort((a, b) => a.timestampMs - b.timestampMs);
      if (this.snapshots.length > this.maxCapacity) {
        this.snapshots.shift();
      }
    }
  }

  /**
   * Returns all stored snapshots.
   */
  public getAllSnapshots(): PipelineSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Returns compact markers for rendering points on the scrubber slider.
   */
  public getTimelinePoints(): HistoricalTimelinePoint[] {
    return this.snapshots.map((s) => ({
      id: s.id,
      timestamp: s.timestamp,
      timestampMs: s.timestampMs,
      label: s.stageLabel,
      status: s.overallStatus,
      scenarioId: s.scenarioId,
    }));
  }

  /**
   * Finds the snapshot that best matches targetMs using bisection search.
   * Returns the snapshot with the largest timestamp <= targetMs.
   * If targetMs is before the earliest snapshot, returns the earliest snapshot.
   */
  public findNearestSnapshot(targetMs: number): PipelineSnapshot | null {
    if (this.snapshots.length === 0) {
      return null;
    }

    if (targetMs <= this.snapshots[0].timestampMs) {
      return this.snapshots[0];
    }

    const last = this.snapshots[this.snapshots.length - 1];
    if (targetMs >= last.timestampMs) {
      return last;
    }

    // Binary search for largest timestamp <= targetMs
    let low = 0;
    let high = this.snapshots.length - 1;
    let bestIndex = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midMs = this.snapshots[mid].timestampMs;

      if (midMs === targetMs) {
        return this.snapshots[mid];
      }

      if (midMs < targetMs) {
        bestIndex = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return this.snapshots[bestIndex];
  }

  /**
   * Records a live telemetry event into the historical timeline,
   * mutating or appending to the current snapshot so live data becomes replayable.
   */
  public recordLiveEvent(event: TelemetryEventPayload, timestampMs: number = Date.now()): PipelineSnapshot {
    const lastSnapshot = this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1]
      : null;

    const baseNodesState = lastSnapshot
      ? { ...lastSnapshot.nodesState }
      : createBaseNodesState();

    const currentNode = baseNodesState[event.node_id] || {
      status: event.status || 'HEALTHY',
      recordsIn: event.records_in,
      recordsOut: event.records_out,
      latencyMs: event.latency_ms,
      alertsCount: 0,
      description: `Nodo ${event.node_id}`,
    };

    const quarantined =
      typeof event.details?.quarantined_records === 'number'
        ? event.details.quarantined_records
        : currentNode.quarantinedRecords;

    const updatedNode: PipelineSnapshotNodeState = {
      ...currentNode,
      status: event.status || currentNode.status,
      recordsIn: event.records_in !== undefined ? event.records_in : currentNode.recordsIn,
      recordsOut: event.records_out !== undefined ? event.records_out : currentNode.recordsOut,
      latencyMs: event.latency_ms !== undefined ? event.latency_ms : currentNode.latencyMs,
      quarantinedRecords: quarantined,
    };

    if (event.node_id === 'guardian_monitor' && event.details) {
      updatedNode.guardianDetails = {
        ...currentNode.guardianDetails,
        playbook_id: (event.details.playbook_id as string) || currentNode.guardianDetails?.playbook_id,
        action_taken: (event.details.action_taken as string) || currentNode.guardianDetails?.action_taken,
        quarantined_records: quarantined,
        message: (event.details.message as string) || currentNode.guardianDetails?.message,
        anomaly_type: (event.details.anomaly_type as any) || currentNode.guardianDetails?.anomaly_type,
      };
    }

    baseNodesState[event.node_id] = updatedNode;

    // Compute overall pipeline status
    const statuses = Object.values(baseNodesState).map((n) => n.status);
    let overallStatus: NodeStatus = 'HEALTHY';
    if (statuses.includes('ERROR')) {
      overallStatus = 'ERROR';
    } else if (statuses.includes('AUTO_HEALING')) {
      overallStatus = 'AUTO_HEALING';
    } else if (statuses.includes('DEGRADED')) {
      overallStatus = 'DEGRADED';
    }

    const newSnapshot: PipelineSnapshot = {
      id: `live_${event.event_id || timestampMs}`,
      timestamp: event.timestamp || new Date(timestampMs).toISOString(),
      timestampMs,
      stageLabel: 'Live Telemetría',
      overallStatus,
      recordsProcessed: event.records_out || (lastSnapshot?.recordsProcessed ?? 0),
      recordsQuarantined: quarantined ?? (lastSnapshot?.recordsQuarantined ?? 0),
      recordsTotal: (event.records_out || 0) + (quarantined || 0),
      sparkRps: (event.details?.spark_rps as number) || (event.details?.throughput_rps as number) || lastSnapshot?.sparkRps,
      airflowRps: (event.details?.airflow_rps as number) || lastSnapshot?.airflowRps,
      nodesState: baseNodesState,
      activeAlerts: lastSnapshot?.activeAlerts || [],
    };

    this.addSnapshot(newSnapshot);
    return newSnapshot;
  }

  /**
   * Hydrates recent history from the backend buffer (/api/v1/telemetry/buffer) if available.
   */
  public async hydrateFromBuffer(apiBaseUrl: string = 'http://localhost:8000'): Promise<number> {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/telemetry/buffer`);
      if (!response.ok) {
        return 0;
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.events) || data.events.length === 0) {
        return 0;
      }

      let count = 0;
      for (const evt of data.events) {
        const timeMs = evt.timestamp ? new Date(evt.timestamp).getTime() : Date.now();
        this.recordLiveEvent(evt, timeMs);
        count++;
      }
      return count;
    } catch {
      // Graceful fallback: local store remains initialized with canonical snapshots
      return 0;
    }
  }

  /**
   * Clears all snapshots and resets.
   */
  public clear(): void {
    this.snapshots = [];
  }
}

/**
 * Shared singleton instance for time-travel replay operations.
 */
export const historicalSnapshotStore = new HistoricalSnapshotStore();
