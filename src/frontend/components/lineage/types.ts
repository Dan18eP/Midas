export type LineageLayer = 'source' | 'bronze' | 'silver' | 'gold';

export type LineageProvenance = 'gateway' | 'canonical-fallback';

export interface LineageStageNode {
  layer: LineageLayer;
  title: string;
  table: string;
  location: string;
  detail: string;
}

export interface LineageFormula {
  latex: string;
  plain: string;
  description: string;
  canonicalKey: string;
}

export interface LineageCertification {
  qualityPercent: number | null;
  qualitySummary: string;
  lastSyncIso: string;
  freshnessLabel: string;
  auditHash: string;
  auditHashSource: 'gateway' | 'derived-local';
}

export interface NumberLineage {
  metricLabel: string;
  displayValue: string;
  formula: LineageFormula | null;
  stages: LineageStageNode[];
  transformation: string;
  certification: LineageCertification;
  provenance: LineageProvenance;
  requestedAtIso: string;
}

export interface ExplainTarget {
  sourceMessageId: string;
  sourceMessageTimestampIso?: string;
  label: string;
  rawValue: string | number | null;
  unit?: string;
  description?: string;
  goldTableHint?: string;
}

export interface LineageGatewayStage {
  layer?: string;
  table?: string;
  location?: string;
  description?: string;
}

export interface LineageGatewayPayload {
  table?: string;
  formula?: { latex?: string; description?: string; key?: string };
  stages?: LineageGatewayStage[];
  transformation?: string;
  certification?: {
    quality_percent?: number | null;
    quality_summary?: string;
    last_sync?: string | null;
    audit_hash?: string;
  };
}
