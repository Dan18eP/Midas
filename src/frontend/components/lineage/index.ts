export { ExplainNumberProvider, useExplainNumberContext, useOptionalExplainNumber, buildExplainTarget, buildExplainTargetFromText } from './ExplainNumberContext';
export type { ExplainNumberController } from './ExplainNumberContext';
export { ExplainNumberDrawer } from './ExplainNumberDrawer';
export { LineageMiniGraph } from './LineageMiniGraph';
export { LatexFormula } from './LatexFormula';
export { MetricFigure } from './MetricFigure';
export { CANONICAL_METRICS, CANONICAL_METRICS_BY_KEY, matchCanonicalMetric, normalizeText } from './canonicalMetrics';
export type { CanonicalMetricDefinition } from './canonicalMetrics';
export { extractFigureTokens, parseFigureValue, formatFigureValue, valuesLooselyEqual, FIGURE_TOKEN_PATTERN } from './parseFigure';
export {
  LINEAGE_API_BASE,
  LINEAGE_TABLE_PATH,
  LINEAGE_GATEWAY_TIMEOUT_MS,
  LineageGatewayError,
  fetchTableLineage,
} from './lineageApi';
export {
  UNCERTIFIED_QUALITY_SUMMARY,
  UNREPORTED_QUALITY_SUMMARY,
  buildUncertifiedLineage,
  deriveAuditHash,
  formatRelativeFreshness,
  mapGatewayLineage,
  mapGatewayStage,
  resolveGoldTable,
  resolveNumberLineage,
} from './resolveLineage';
export type {
  ExplainTarget,
  LineageCertification,
  LineageFormula,
  LineageGatewayPayload,
  LineageLayer,
  LineageProvenance,
  LineageStageNode,
  NumberLineage,
} from './types';
