/**
 * Midas Canvas — Cliente HTTP del historial de telemetría (HU-FRONT-08).
 *
 * Contrato real del backend (FastAPI):
 *   GET /api/v1/telemetry/history?window=24h&limit=200&node_id=<opcional>
 *   → 200 { window, total_events, events[], nodes_summary{}, active_alerts_count, retrieved_at }
 *
 * Referencia: src/api/routes/telemetry.py → TelemetryHistoryResponse.
 * No se inventa ningún campo: el parser valida y estrecha el payload real.
 */

import type { NodeStatus } from '@/types/canvas';
import type { TelemetryEventPayload } from '@/types/telemetry';

const DEFAULT_API_BASE = 'http://localhost:8000';

export const TELEMETRY_API_BASE = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE;
export const TELEMETRY_HISTORY_PATH = '/api/v1/telemetry/history';
export const TELEMETRY_SCENARIOS_PATH = '/api/v1/telemetry/scenarios';
export const TELEMETRY_HISTORY_TIMEOUT_MS = 2500;

/** Discriminante canónico emitido por el backend al anunciar un mart Gold nuevo. */
export const NEW_GOLD_NODE_EVENT_TYPE = 'NEW_GOLD_NODE_AVAILABLE';

export class TelemetryHistoryError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'TelemetryHistoryError';
    this.status = status;
  }
}

/** Resumen consolidado por nodo que devuelve el gateway. */
export interface TelemetryNodeSummary {
  status?: NodeStatus | string;
  records_in?: number;
  records_out?: number;
  latency_ms?: number;
  last_event_id?: string;
}

/** Payload real de `GET /api/v1/telemetry/history`. */
export interface TelemetryHistoryPayload {
  window: string;
  total_events: number;
  events: TelemetryEventPayload[];
  nodes_summary: Record<string, TelemetryNodeSummary>;
  active_alerts_count: number;
  retrieved_at: string;
}

/** Payload real de `GET /api/v1/telemetry/scenarios/{id}`. */
export interface TelemetryScenarioPayload {
  scenario_id: string;
  event_count: number;
  events: TelemetryEventPayload[];
}

export interface FetchTelemetryHistoryOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  window?: string;
  limit?: number;
  nodeId?: string;
  fetchImpl?: typeof fetch;
}

export interface FetchTelemetryScenarioOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const VALID_NODE_STATUSES: readonly NodeStatus[] = [
  'HEALTHY',
  'RUNNING',
  'DEGRADED',
  'ERROR',
  'IN_PROGRESS',
  'AUTO_HEALING',
  'UNKNOWN',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function narrowNodeStatus(value: unknown): NodeStatus | null {
  return typeof value === 'string' && (VALID_NODE_STATUSES as readonly string[]).includes(value)
    ? (value as NodeStatus)
    : null;
}

/**
 * Convierte un evento crudo del gateway en `TelemetryEventPayload`.
 * Devuelve `null` si el evento no cumple el contrato mínimo `TelemetryEvent`.
 */
export function parseTelemetryEvent(raw: unknown): TelemetryEventPayload | null {
  if (!isRecord(raw)) return null;

  const status = narrowNodeStatus(raw.status);
  if (status === null) return null;
  if (typeof raw.event_id !== 'string' || raw.event_id.length === 0) return null;
  if (typeof raw.node_id !== 'string' || raw.node_id.length === 0) return null;

  const recordsIn = typeof raw.records_in === 'number' ? raw.records_in : 0;
  const recordsOut = typeof raw.records_out === 'number' ? raw.records_out : 0;
  const latencyMs = typeof raw.latency_ms === 'number' ? raw.latency_ms : 0;
  const timestamp =
    typeof raw.timestamp === 'string' && raw.timestamp.length > 0
      ? raw.timestamp
      : new Date().toISOString();

  const details = isRecord(raw.details) ? raw.details : undefined;

  return {
    event_id: raw.event_id,
    pipeline_id: typeof raw.pipeline_id === 'string' ? raw.pipeline_id : '',
    node_id: raw.node_id,
    status,
    records_in: recordsIn,
    records_out: recordsOut,
    latency_ms: latencyMs,
    timestamp,
    ...(details ? { details } : {}),
  };
}

/** Valida y estrecha el payload del endpoint de historial. */
export function parseTelemetryHistoryPayload(raw: unknown): TelemetryHistoryPayload | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.events)) return null;

  const events = raw.events
    .map((event) => parseTelemetryEvent(event))
    .filter((event): event is TelemetryEventPayload => event !== null);

  const nodesSummary: Record<string, TelemetryNodeSummary> = {};
  if (isRecord(raw.nodes_summary)) {
    for (const [nodeId, summary] of Object.entries(raw.nodes_summary)) {
      if (!isRecord(summary)) continue;
      nodesSummary[nodeId] = {
        status: narrowNodeStatus(summary.status) ?? undefined,
        records_in: typeof summary.records_in === 'number' ? summary.records_in : undefined,
        records_out: typeof summary.records_out === 'number' ? summary.records_out : undefined,
        latency_ms: typeof summary.latency_ms === 'number' ? summary.latency_ms : undefined,
        last_event_id: typeof summary.last_event_id === 'string' ? summary.last_event_id : undefined,
      };
    }
  }

  return {
    window: typeof raw.window === 'string' ? raw.window : '24h',
    total_events: typeof raw.total_events === 'number' ? raw.total_events : events.length,
    events,
    nodes_summary: nodesSummary,
    active_alerts_count: typeof raw.active_alerts_count === 'number' ? raw.active_alerts_count : 0,
    retrieved_at:
      typeof raw.retrieved_at === 'string' ? raw.retrieved_at : new Date().toISOString(),
  };
}

async function requestJson(
  url: string,
  options: { signal?: AbortSignal; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? TELEMETRY_HISTORY_TIMEOUT_MS,
  );
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new TelemetryHistoryError(
      'El historial de telemetría no está disponible: no se pudo contactar al Gateway.',
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      isRecord(payload) && typeof payload.detail === 'string' ? payload.detail : '';
    throw new TelemetryHistoryError(
      detail || `El Gateway de telemetría respondió con HTTP ${response.status}.`,
      response.status,
    );
  }

  return payload;
}

/**
 * Descarga el historial real de telemetría del Gateway FastAPI.
 */
export async function fetchTelemetryHistory(
  options: FetchTelemetryHistoryOptions = {},
): Promise<TelemetryHistoryPayload> {
  const params = new URLSearchParams();
  params.set('window', options.window ?? '24h');
  params.set('limit', String(options.limit ?? 200));
  if (options.nodeId) params.set('node_id', options.nodeId);

  const url = `${TELEMETRY_API_BASE}${TELEMETRY_HISTORY_PATH}?${params.toString()}`;
  const raw = await requestJson(url, options);
  const parsed = parseTelemetryHistoryPayload(raw);
  if (!parsed) {
    throw new TelemetryHistoryError('El Gateway devolvió un historial con formato no interpretable.');
  }
  return parsed;
}

/**
 * Descarga los eventos publicados por el backend para un escenario canónico (T0–T3).
 * Son hitos de demostración del backend; no son telemetría persistida.
 */
export async function fetchTelemetryScenario(
  scenarioId: string,
  options: FetchTelemetryScenarioOptions = {},
): Promise<TelemetryScenarioPayload> {
  const url = `${TELEMETRY_API_BASE}${TELEMETRY_SCENARIOS_PATH}/${encodeURIComponent(scenarioId)}`;
  const raw = await requestJson(url, options);
  if (!isRecord(raw) || !Array.isArray(raw.events)) {
    throw new TelemetryHistoryError(
      `El escenario '${scenarioId}' devolvió un payload no interpretable.`,
    );
  }
  return {
    scenario_id: typeof raw.scenario_id === 'string' ? raw.scenario_id : scenarioId,
    event_count: typeof raw.event_count === 'number' ? raw.event_count : raw.events.length,
    events: raw.events
      .map((event) => parseTelemetryEvent(event))
      .filter((event): event is TelemetryEventPayload => event !== null),
  };
}
