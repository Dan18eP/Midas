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
