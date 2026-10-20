/**
 * Midas Canvas — Time-Travel Replay & Operational Historical Slider Data Models
 * Synchronized with HU-FRONT-03 specification and telemetry stream contracts.
 */

import { NodeStatus, GuardianDetails } from './canvas';

export type TimeTravelMode = 'LIVE' | 'REPLAY';

export type ReplaySpeed = 1 | 2 | 5;

export const REPLAY_SPEEDS: readonly ReplaySpeed[] = [1, 2, 5] as const;

/**
 * Historical state of an individual node in the pipeline at snapshot time T.
 */
export interface PipelineSnapshotNodeState {
  status: NodeStatus;
  recordsIn: number;
  recordsOut: number;
  latencyMs?: number;
  quarantinedRecords?: number;
  alertsCount?: number;
  description?: string;
  guardianDetails?: GuardianDetails;
}

/**
 * Historical alert active during snapshot time T.
 */
export interface HistoricalAlert {
  id: string;
  nodeId: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

/**
 * Point-in-time snapshot of the entire Midas data pipeline.
 */
export interface PipelineSnapshot {
  id: string;
  timestamp: string; // ISO 8601
  timestampMs: number;
  scenarioId?: string;
  stageLabel: string;
  overallStatus: NodeStatus;
  recordsProcessed: number;
  recordsQuarantined: number;
  recordsTotal: number;
  sparkRps?: number;
  airflowRps?: number;
  nodesState: Record<string, PipelineSnapshotNodeState>;
  activeAlerts: HistoricalAlert[];
  description?: string;
}

/**
 * Compact marker for rendering points on the scrubber track.
 */
export interface HistoricalTimelinePoint {
  id: string;
  timestamp: string;
  timestampMs: number;
  label: string;
  status: NodeStatus;
  scenarioId?: string;
}

/**
 * Complete state machine model for the TimeTravel replay engine.
 */
export interface TimeTravelState {
  mode: TimeTravelMode;
  isPlaying: boolean;
  speed: ReplaySpeed;
  currentTimeMs: number;
  windowStartMs: number;
  windowEndMs: number;
  activeSnapshot: PipelineSnapshot | null;
  relativeOffsetMinutes: number;
  relativeOffsetLabel: string; // e.g. "T-15m" or "T-1h 30m"
  availableSnapshots: PipelineSnapshot[];
}

/**
 * Helper to compute human-readable offset label (e.g. "T-0m", "T-42m", "T-2h 15m")
 */
export function formatRelativeOffsetLabel(offsetMinutes: number): string {
  const rounded = Math.max(0, Math.round(offsetMinutes));
  if (rounded === 0) {
    return 'T-0m';
  }
  if (rounded < 60) {
    return `T-${rounded}m`;
  }
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (minutes === 0) {
    return `T-${hours}h`;
  }
  return `T-${hours}h ${minutes}m`;
}
