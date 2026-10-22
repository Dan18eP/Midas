/**
 * Midas Canvas — Canonical TypeScript Telemetry Models
 * Synchronized with src/core/telemetry/events.py and backend SSE stream contracts.
 */

import { NodeStatus, AnomalyType } from './canvas';

export type ConnectionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTED';

export interface TelemetryGuardianDetails {
  anomaly_type?: AnomalyType | string;
  playbook_id?: string;
  action_taken?: string;
  quarantined_records?: number;
  message?: string;
  [key: string]: unknown;
}

/**
 * Raw telemetry payload emitted by the FastAPI SSE Hub at /api/v1/telemetry/stream
 */
export interface TelemetryEventPayload {
  event_id: string;
  pipeline_id: string;
  node_id: string;
  status: NodeStatus;
  records_in: number;
  records_out: number;
  latency_ms: number;
  timestamp: string;
  details?: {
    quarantined_records?: number;
    anomaly_type?: string;
    playbook_id?: string;
    action_taken?: string;
    throughput_rps?: number;
    records_per_second?: number;
    spark_rps?: number;
    airflow_rps?: number;
    /**
     * Discriminante semántico del evento. El backend publica
     * `NEW_GOLD_NODE_AVAILABLE` al anunciar un mart Gold recién materializado
     * (ver src/agent/tools/dag_generator.py).
     */
    event_type?: string;
    /** Nombre calificado de la tabla anunciada (Gold). */
    output_table?: string;
    [key: string]: unknown;
  };
}

/**
 * Options for useTelemetryStream hook
 */
export interface UseTelemetryStreamOptions {
  /**
   * SSE stream endpoint URL.
   * Defaults to NEXT_PUBLIC_SSE_URL or http://localhost:8000/api/v1/telemetry/stream
   */
  url?: string;
  /**
   * Whether to automatically establish the SSE connection on mount.
   * Default: true
   */
  autoConnect?: boolean;
  /**
   * Initial reconnection delay in milliseconds.
   * Default: 1000ms
   */
  initialBackoffMs?: number;
  /**
   * Maximum reconnection delay cap in milliseconds.
   * Default: 15000ms
   */
  maxBackoffMs?: number;
  /**
   * Exponential backoff multiplier.
   * Default: 1.5
   */
  backoffMultiplier?: number;
  /**
   * Maximum number of consecutive reconnection attempts before marking DISCONNECTED.
   * Default: 10
   */
  maxReconnectAttempts?: number;
  /**
   * Callback fired on each valid parsed telemetry event.
   */
  onEvent?: (event: TelemetryEventPayload) => void;
  /**
   * Callback fired on connection error.
   */
  onError?: (error: Event) => void;
  /**
   * Custom EventSource constructor for dependency injection / testing.
   */
  eventSourceFactory?: (url: string) => EventSource;
}

/**
 * Hook return type
 */
export interface UseTelemetryStreamReturn {
  connectionStatus: ConnectionStatus;
  lastEvent: TelemetryEventPayload | null;
  metricsByNode: Record<string, TelemetryEventPayload>;
  sparkRps: number;
  airflowRps: number;
  lastEventId: string | null;
  reconnectAttempts: number;
  connect: () => void;
  disconnect: () => void;
}

/**
 * Deduce el throughput efectivo (registros/segundo) a partir de los metadatos del evento de telemetría.
 */
export function extractTelemetryRate(event: TelemetryEventPayload): number {
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

  // Fallback calculation: records_out / (latency_ms / 1000)
  if (event.latency_ms > 0 && event.records_out > 0) {
    return Math.round((event.records_out / event.latency_ms) * 1000);
  }

  return event.records_out;
}
