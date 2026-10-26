/**
 * Midas Canvas — Historical Snapshot Store & Telemetry Replay Service.
 *
 * HU-FRONT-08 (Desmockitización Total): el store **no fabrica** snapshots en el
 * flujo productivo. La línea de tiempo se hidrata desde el Gateway FastAPI:
 *
 *   - `GET /api/v1/telemetry/history`          → historial real (eventos del Hub)
 *   - `GET /api/v1/telemetry/scenarios/{id}`   → hitos canónicos T0–T3 del backend
 *
 * `createCanonicalSnapshots()` se conserva **exclusivamente como fixture de
 * pruebas/demo**. Ningún camino productivo lo invoca.
 */

import { NodeStatus } from '@/types/canvas';
import { TelemetryEventPayload } from '@/types/telemetry';
import {
  PipelineSnapshot,
  PipelineSnapshotNodeState,
  HistoricalTimelinePoint,
  HistoricalAlert,
} from '@/types/timeTravel';
import {
  fetchTelemetryHistory,
  fetchTelemetryScenario,
  type FetchTelemetryHistoryOptions,
  type FetchTelemetryScenarioOptions,
  type TelemetryHistoryPayload,
} from './telemetryHistoryApi';

/** Estado observable de la hidratación del historial. */
export type TelemetryHistoryStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

/**
 * Hitos canónicos T0–T3 anclados sobre los eventos que publica el backend en
 * `GET /api/v1/telemetry/scenarios/{id}`. Los offsets son los canónicos de
 * `documentation/canonical/05` §3.1 y **no** representan telemetría persistida:
 * el contenido de los eventos es del backend, el anclaje temporal es de la demo.
 */
export const CANONICAL_SCENARIO_META: Record<
  string,
  { offsetMs: number; label: string }
> = {
  T0: { offsetMs: -24 * 60 * 60 * 1000, label: 'Operación Normal (T-24h)' },
  T1: { offsetMs: -45 * 60 * 1000, label: 'Incidente F3 Detectado (T-45m)' },
  T2: { offsetMs: -25 * 60 * 1000, label: 'Guardian Auto-Healing (T-25m)' },
  T3: { offsetMs: -5 * 60 * 1000, label: 'Recuperado & Publicado (T-5m)' },
};

/**
 * Crea el estado base de los nodos para la línea de tiempo canónica.
 * **Fixture de pruebas/demo**: no se usa en el flujo productivo.
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
      status: 'STANDBY',
      recordsIn: 0,
      recordsOut: 0,
      latencyMs: 0.0,
      alertsCount: 0,
      description: 'Gold Marts en espera de definición analítica vía Copiloto.',
    },
  };
}

/**
 * Builds canonical snapshots anchored along the 24-hour timeline relative to referenceNowMs.
 * Covers: T-24h (T0), T-12h (T0), T-2h (T0 Steady), T-45m (T1 Incident), T-25m (T2 Healing), T-5m (T3 Recovered), T-0m (Live Baseline).
 *
 * ⚠️ **FIXTURE DE PRUEBAS / DEMOSTRACIÓN.** Este contenido es sintético y no se
 * usa en el flujo productivo (HU-FRONT-08). En producción la línea de tiempo se
 * hidrata con `GET /api/v1/telemetry/history`.
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
    stageLabel: 'Operación estable (T-2h)',
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

function computeOverallStatus(statuses: NodeStatus[]): NodeStatus {
  if (statuses.includes('ERROR')) return 'ERROR';
  if (statuses.includes('AUTO_HEALING')) return 'AUTO_HEALING';
  if (statuses.includes('DEGRADED')) return 'DEGRADED';
  if (statuses.includes('IN_PROGRESS')) return 'IN_PROGRESS';
  if (statuses.includes('RUNNING')) return 'RUNNING';
  if (statuses.length > 0 && statuses.every((status) => status === 'HEALTHY')) return 'HEALTHY';
  return 'UNKNOWN';
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

interface SnapshotMeta {
  id: string;
  stageLabel: string;
  scenarioId?: string;
  description?: string;
}

/**
 * HistoricalSnapshotStore manages the in-memory chronological timeline of snapshots.
 *
 * HU-FRONT-08: el store **arranca vacío**. La línea de tiempo real se hidrata con
 * `hydrateFromHistory()` (eventos del Gateway) y, opcionalmente, con
 * `hydrateScenarioAnchors()` (hitos T0–T3 publicados por el backend).
 */
export class HistoricalSnapshotStore {
  private snapshots: PipelineSnapshot[] = [];
  private maxCapacity: number = 500;
  private historyStatus: TelemetryHistoryStatus = 'idle';
  private historyError: string | null = null;
  private listeners: Set<() => void> = new Set();

  constructor(initialSnapshots?: PipelineSnapshot[]) {
    if (initialSnapshots && initialSnapshots.length > 0) {
      this.snapshots = [...initialSnapshots].sort((a, b) => a.timestampMs - b.timestampMs);
    }
  }

  /**
   * ⚠️ **FIXTURE DE PRUEBAS / DEMOSTRACIÓN.**
   * Siembra la línea de tiempo canónica sintética T0–T3. El flujo productivo
   * **no** debe invocar este método: use `hydrateFromHistory()`.
   */
  public seedCanonicalScenarios(referenceNowMs: number = Date.now()): void {
    this.snapshots = createCanonicalSnapshots(referenceNowMs);
    this.notify();
  }

  /** Suscripción a los cambios de estado del store (hidratación, errores). */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Estado observable de la última hidratación del historial. */
  public getHistoryStatus(): TelemetryHistoryStatus {
    return this.historyStatus;
  }

  /** Último error de hidratación, o `null`. */
  public getHistoryError(): string | null {
    return this.historyError;
  }

  /**
   * Descarga el historial real del Gateway y reconstruye la línea de tiempo.
   * No fabricate datos: si el Gateway no responde, el estado pasa a `error` y la
   * línea de tiempo conserva lo que hubiera (posiblemente nada).
   */
  public async hydrateFromHistory(
    options: FetchTelemetryHistoryOptions = {},
  ): Promise<number> {
    this.historyStatus = 'loading';
    this.historyError = null;
    this.notify();

    try {
      const payload = await fetchTelemetryHistory(options);
      this.replaceWithHistory(payload);
      this.historyStatus = payload.events.length === 0 ? 'empty' : 'ready';
      this.historyError = null;
      this.notify();
      return payload.events.length;
    } catch (error) {
      this.historyStatus = 'error';
      this.historyError =
        error instanceof Error ? error.message : 'Error desconocido al cargar el historial.';
      this.notify();
      return 0;
    }
  }

  /**
   * Descarga del backend los hitos canónicos T0–T3 y los ancla en la línea de
   * tiempo. El **contenido** de los eventos es del backend; el anclaje temporal
   * usa los offsets canónicos de `documentation/canonical/05` §3.1.
   *
   * Un fallo individual de un escenario no aborta el resto.
   */
  public async hydrateScenarioAnchors(
    options: FetchTelemetryScenarioOptions & { referenceNowMs?: number } = {},
  ): Promise<number> {
    const referenceNowMs = options.referenceNowMs ?? Date.now();
    let loaded = 0;

    for (const [scenarioId, meta] of Object.entries(CANONICAL_SCENARIO_META)) {
      try {
        const payload = await fetchTelemetryScenario(scenarioId, options);
        if (payload.events.length === 0) continue;
        const timestampMs = referenceNowMs + meta.offsetMs;
        const snapshot = this.buildScenarioSnapshot(scenarioId, meta.label, payload.events, timestampMs);
        this.appendSnapshot(snapshot);
        loaded += 1;
      } catch {
        // Un escenario no disponible no invalida el resto de la línea de tiempo.
      }
    }

    if (loaded > 0) this.notify();
    return loaded;
  }

  /**
   * Appends or replaces a snapshot, keeping chronological sorting.
   */
  public addSnapshot(snapshot: PipelineSnapshot): void {
    this.appendSnapshot(snapshot);
  }

  private appendSnapshot(snapshot: PipelineSnapshot): void {
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
    const lastSnapshot =
      this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;

    const baseNodesState: Record<string, PipelineSnapshotNodeState> = lastSnapshot
      ? { ...lastSnapshot.nodesState }
      : {};

    const newSnapshot = this.buildEventSnapshot(
      event,
      timestampMs,
      baseNodesState,
      {
        id: `live_${event.event_id || timestampMs}`,
        stageLabel: 'Live Telemetría',
        description: 'Evento en vivo del Hub de telemetría (SSE).',
      },
      lastSnapshot,
    );

    this.appendSnapshot(newSnapshot);
    return newSnapshot;
  }

  /**
   * Clears all snapshots and resets.
   */
  public clear(): void {
    this.snapshots = [];
    this.historyStatus = 'idle';
    this.historyError = null;
    this.notify();
  }

  // ---------------------------------------------------------------------------
  // Construcción de snapshots
  // ---------------------------------------------------------------------------

  private replaceWithHistory(payload: TelemetryHistoryPayload): void {
    this.snapshots = [];

    const events = [...payload.events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    let baseNodesState: Record<string, PipelineSnapshotNodeState> = {};

    for (const event of events) {
      const parsedTime = new Date(event.timestamp).getTime();
      const timestampMs = Number.isNaN(parsedTime) ? Date.now() : parsedTime;
      const snapshot = this.buildEventSnapshot(
        event,
        timestampMs,
        baseNodesState,
        {
          id: `hist_${event.event_id}`,
          stageLabel: 'Historial del Gateway',
          description: 'Evento del historial de telemetría (GET /api/v1/telemetry/history).',
        },
        null,
      );
      baseNodesState = snapshot.nodesState;
      this.appendSnapshot(snapshot);
    }

    // El resumen consolidado del gateway completa el estado del último snapshot
    // para los nodos sin evento propio (eventos recortados por `limit`).
    const last = this.snapshots[this.snapshots.length - 1];
    if (last) {
      const nodesState = { ...last.nodesState };
      for (const [nodeId, summary] of Object.entries(payload.nodes_summary)) {
        if (nodesState[nodeId]) continue;
        nodesState[nodeId] = {
          status: (summary.status as NodeStatus) ?? 'UNKNOWN',
          recordsIn: summary.records_in ?? 0,
          recordsOut: summary.records_out ?? 0,
          latencyMs: summary.latency_ms,
          alertsCount: 0,
        };
      }
      this.appendSnapshot({ ...last, nodesState });
    }
  }

  private buildScenarioSnapshot(
    scenarioId: string,
    label: string,
    events: TelemetryEventPayload[],
    timestampMs: number,
  ): PipelineSnapshot {
    const nodesState: Record<string, PipelineSnapshotNodeState> = {};
    let recordsProcessed = 0;
    let recordsQuarantined = 0;
    let sparkRps: number | undefined;
    let airflowRps: number | undefined;

    for (const event of events) {
      const quarantined =
        typeof event.details?.quarantined_records === 'number'
          ? event.details.quarantined_records
          : 0;

      const nodeState: PipelineSnapshotNodeState = {
        status: event.status,
        recordsIn: event.records_in,
        recordsOut: event.records_out,
        latencyMs: event.latency_ms,
        quarantinedRecords: quarantined,
        alertsCount: 0,
      };

      if (event.node_id === 'guardian_monitor' && event.details) {
        nodeState.guardianDetails = {
          playbook_id: event.details.playbook_id as string | undefined,
          action_taken: event.details.action_taken as string | undefined,
          quarantined_records: quarantined,
          message: event.details.message as string | undefined,
          anomaly_type: event.details.anomaly_type as never,
        };
      }

      nodesState[event.node_id] = nodeState;
      recordsProcessed += event.records_out;
      recordsQuarantined += quarantined;

      sparkRps = readNumber(event.details?.spark_rps) ?? sparkRps;
      airflowRps = readNumber(event.details?.airflow_rps) ?? airflowRps;
    }

    const statuses = Object.values(nodesState).map((node) => node.status);

    return {
      id: `scenario_${scenarioId}_${timestampMs}`,
      timestamp: new Date(timestampMs).toISOString(),
      timestampMs,
      scenarioId,
      stageLabel: `Escenario ${scenarioId} · ${label}`,
      overallStatus: computeOverallStatus(statuses),
      recordsProcessed,
      recordsQuarantined,
      recordsTotal: recordsProcessed + recordsQuarantined,
      sparkRps,
      airflowRps,
      nodesState,
      activeAlerts: [],
      description:
        'Hito del escenario canónico publicado por el Gateway de telemetría. No es telemetría persistida.',
    };
  }

  private buildEventSnapshot(
    event: TelemetryEventPayload,
    timestampMs: number,
    baseNodesState: Record<string, PipelineSnapshotNodeState>,
    meta: SnapshotMeta,
    lastSnapshot: PipelineSnapshot | null,
  ): PipelineSnapshot {
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
        anomaly_type: (event.details.anomaly_type as never) || currentNode.guardianDetails?.anomaly_type,
      };
    }

    const nodesState = { ...baseNodesState, [event.node_id]: updatedNode };

    return {
      id: meta.id,
      timestamp: event.timestamp || new Date(timestampMs).toISOString(),
      timestampMs,
      scenarioId: meta.scenarioId,
      stageLabel: meta.stageLabel,
      overallStatus: computeOverallStatus(Object.values(nodesState).map((node) => node.status)),
      recordsProcessed: event.records_out || (lastSnapshot?.recordsProcessed ?? 0),
      recordsQuarantined: quarantined ?? (lastSnapshot?.recordsQuarantined ?? 0),
      recordsTotal: (event.records_out || 0) + (quarantined || 0),
      sparkRps:
        readNumber(event.details?.spark_rps) ??
        readNumber(event.details?.throughput_rps) ??
        lastSnapshot?.sparkRps,
      airflowRps: readNumber(event.details?.airflow_rps) ?? lastSnapshot?.airflowRps,
      nodesState,
      activeAlerts: lastSnapshot?.activeAlerts || [],
      description: meta.description,
    };
  }
}

/**
 * Shared singleton instance for time-travel replay operations.
 * Arranca **vacío**: la línea de tiempo se hidrata desde el Gateway FastAPI.
 */
export const historicalSnapshotStore = new HistoricalSnapshotStore();
