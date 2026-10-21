export type LineageLayer = 'source' | 'bronze' | 'silver' | 'gold';

/**
 * Procedencia del linaje resuelto.
 *
 * - `gateway`: certificado por `GET /api/v1/lineage/table/{table}`.
 * - `uncertified`: el gateway no entregó evidencia (HU-FRONT-08). El resultado
 *   **no** declara porcentaje de calidad ni resumen de certificación.
 */
export type LineageProvenance = 'gateway' | 'uncertified';

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
  /** Porcentaje de calidad certificado; `null` cuando no hay evidencia. */
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
    quality_percent?: number;
    quality_summary?: string;
    last_sync?: string;
    audit_hash?: string;
  };
}
