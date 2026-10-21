import { CANONICAL_METRICS_BY_KEY, matchCanonicalMetric, type CanonicalMetricDefinition } from './canonicalMetrics';
import { fetchTableLineage } from './lineageApi';
import { formatFigureValue } from './parseFigure';
import type {
  ExplainTarget,
  LineageCertification,
  LineageGatewayPayload,
  LineageLayer,
  LineageStageNode,
  NumberLineage,
} from './types';

const LAYER_ORDER: LineageLayer[] = ['source', 'bronze', 'silver', 'gold'];

/**
 * Títulos canónicos de cada capa de la Medallion.
 * Mismo vocabulario que `canonicalMetrics.ts` (espejo del doc canónico 04) y que
 * las descripciones del motor canónico del backend
 * (`src/core/lineage/canonical_lineage.py`).
 *
 * HU-FRONT-08: el backend **no** devuelve `title` en cada etapa; el frontend lo
 * deriva de esta tabla canónica en lugar de inventarlo.
 */
const LAYER_TITLES: Record<LineageLayer, string> = {
  source: 'Fuente Original',
  bronze: 'Bronze Parquet',
  silver: 'Silver Cleanse',
  gold: 'Gold Mart',
};

/** Resumen honesto cuando el gateway de linaje no entrega certificación. */
export const UNCERTIFIED_QUALITY_SUMMARY =
  'Sin certificación: el gateway de linaje no entregó evidencia verificable.';

/** Resumen honesto cuando el gateway responde sin métrica de calidad. */
export const UNREPORTED_QUALITY_SUMMARY = 'El gateway de linaje no reportó calidad.';

export function deriveAuditHash(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

export function formatRelativeFreshness(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Sin registro de frescura';
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Actualizado hace instantes';
  if (minutes < 60) return `Actualizado hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Actualizado hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Actualizado hace ${days} d`;
}

export function resolveDisplayValue(target: ExplainTarget): string {
  const suffix = target.unit ? ` ${target.unit}` : '';
  if (target.rawValue === null || target.rawValue === undefined || target.rawValue === '') {
    return target.label;
  }
  if (typeof target.rawValue === 'number') {
    return `${formatFigureValue(target.rawValue)}${suffix}`;
  }
  return `${target.rawValue}${suffix}`;
}

/**
 * Resuelve la tabla Gold que se debe consultar en el gateway.
 * Devuelve `null` cuando no hay evidencia de qué tabla preguntar: en ese caso
 * **no se consulta** ningún endpoint (HU-FRONT-08).
 */
export function resolveGoldTable(
  target: ExplainTarget,
  metric: CanonicalMetricDefinition | null,
): string | null {
  if (target.goldTableHint) return target.goldTableHint;
  const goldStage = metric?.stages.find((stage) => stage.layer === 'gold');
  return goldStage?.table ?? null;
}

function buildCertification(
  lastSyncIso: string,
  auditHash: string,
  auditHashSource: LineageCertification['auditHashSource'],
  now: Date,
  qualityPercent: number | null,
  qualitySummary: string,
): LineageCertification {
  return {
    qualityPercent,
    qualitySummary,
    lastSyncIso,
    freshnessLabel: formatRelativeFreshness(lastSyncIso, now),
    auditHash,
    auditHashSource,
  };
}

/**
 * Construye un linaje **explícitamente no certificado**.
 *
 * HU-FRONT-08: sin gateway de linaje no hay evidencia de certificación. Este
 * resultado NO declara porcentaje de calidad, NO invoca el resumen "100%
 * Contratos de Datos Certificados (OpenMetadata)" y marca el hash como traza
 * local reproducible (no como firma del catálogo).
 */
export function buildUncertifiedLineage(
  target: ExplainTarget,
  metric: CanonicalMetricDefinition | null,
  options: { lastSyncIso: string; now?: Date },
): NumberLineage {
  const now = options.now ?? new Date();
  const goldTable = resolveGoldTable(target, metric);
  const auditHash = deriveAuditHash(
    `${metric?.key ?? 'unclassified'}|${goldTable ?? 'no-table'}|${options.lastSyncIso}`,
  );

  return {
    metricLabel: metric?.label ?? target.label,
    displayValue: resolveDisplayValue(target),
    formula: metric
      ? { latex: metric.latex, plain: metric.plain, description: metric.description, canonicalKey: metric.key }
      : null,
    stages: metric?.stages ?? [],
    transformation:
      metric?.transformation ??
      'Sin transformación certificada: la cifra no está registrada en el Diccionario Semántico Inmutable.',
    certification: buildCertification(
      options.lastSyncIso,
      auditHash,
      'derived-local',
      now,
      null,
      UNCERTIFIED_QUALITY_SUMMARY,
    ),
    provenance: 'uncertified',
    requestedAtIso: now.toISOString(),
  };
}

/**
 * Mapea una etapa del gateway. **No rellena** campos ausentes con literales:
 * una etapa sin tabla o sin ubicación no es certificable y se descarta.
 */
export function mapGatewayStage(raw: Record<string, unknown>): LineageStageNode | null {
  const layer = String(raw.layer ?? '').toLowerCase() as LineageLayer;
  if (!LAYER_ORDER.includes(layer)) return null;

  const table = typeof raw.table === 'string' ? raw.table.trim() : '';
  const location = typeof raw.location === 'string' ? raw.location.trim() : '';
  if (!table || !location) return null;

  const description =
    typeof raw.description === 'string' && raw.description.trim().length > 0
      ? raw.description.trim()
      : typeof raw.detail === 'string' && raw.detail.trim().length > 0
        ? raw.detail.trim()
        : '';

  return {
    layer,
    title: LAYER_TITLES[layer],
    table,
    location,
    detail: description,
  };
}

/**
 * Traduce el payload del gateway de linaje al contrato del drawer.
 * Devuelve `null` si el payload no contiene ninguna etapa certificable.
 */
export function mapGatewayLineage(
  payload: LineageGatewayPayload,
  target: ExplainTarget,
  metric: CanonicalMetricDefinition | null,
  options: { lastSyncIso: string; now?: Date },
): NumberLineage | null {
  const now = options.now ?? new Date();
  const rawStages = Array.isArray(payload.stages) ? payload.stages : [];
  const mapped = rawStages
    .map((stage) => mapGatewayStage((stage ?? {}) as Record<string, unknown>))
    .filter((stage): stage is LineageStageNode => stage !== null)
    .sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer));

  if (mapped.length === 0) return null;

  const certification = payload.certification ?? {};
  const lastSyncIso =
    typeof certification.last_sync === 'string' && certification.last_sync
      ? certification.last_sync
      : options.lastSyncIso;
  const hasGatewayAuditHash =
    typeof certification.audit_hash === 'string' && certification.audit_hash.length > 0;
  const auditHash = hasGatewayAuditHash
    ? (certification.audit_hash as string)
    : deriveAuditHash(`${metric?.key ?? 'unclassified'}|${payload.table ?? ''}|${lastSyncIso}`);

  const qualityPercent =
    typeof certification.quality_percent === 'number' && Number.isFinite(certification.quality_percent)
      ? certification.quality_percent
      : null;
  const qualitySummary =
    typeof certification.quality_summary === 'string' && certification.quality_summary.length > 0
      ? certification.quality_summary
      : UNREPORTED_QUALITY_SUMMARY;

  return {
    metricLabel: metric?.label ?? target.label,
    displayValue: resolveDisplayValue(target),
    formula: metric
      ? {
          latex: payload.formula?.latex || metric.latex,
          plain: metric.plain,
          description: payload.formula?.description || metric.description,
          canonicalKey: payload.formula?.key || metric.key,
        }
      : null,
    stages: mapped,
    transformation:
      payload.transformation || metric?.transformation || 'Transformación reportada por OpenMetadata.',
    certification: buildCertification(
      lastSyncIso,
      auditHash,
      hasGatewayAuditHash ? 'gateway' : 'derived-local',
      now,
      qualityPercent,
      qualitySummary,
    ),
    provenance: 'gateway',
    requestedAtIso: now.toISOString(),
  };
}

export interface ResolveLineageOptions {
  lastSyncIso: string;
  now?: Date;
  signal?: AbortSignal;
  fetchImpl?: typeof fetchTableLineage;
}

/**
 * Resuelve el linaje de una cifra.
 *
 * HU-FRONT-08: el gateway de linaje es la **única** fuente de certificación.
 * Si no responde, el resultado se marca como no certificado — nunca como
 * certificado con datos locales.
 */
export async function resolveNumberLineage(
  target: ExplainTarget,
  options: ResolveLineageOptions,
): Promise<NumberLineage> {
  const metric = matchCanonicalMetric(target.label);
  const goldTable = resolveGoldTable(target, metric);

  // Sin métrica certificada ni hint de tabla del agente no se consulta el
  // gateway: el linaje de una tabla no certificaría la cifra clickeada.
  if (!goldTable) {
    return buildUncertifiedLineage(target, metric, options);
  }

  const fetchImpl = options.fetchImpl ?? fetchTableLineage;

  try {
    const payload = await fetchImpl(goldTable, { signal: options.signal });
    const fromGateway = mapGatewayLineage(payload, target, metric, options);
    if (fromGateway) return fromGateway;
  } catch {
    // Gateway de linaje no disponible: se degrada a un resultado explícitamente
    // NO certificado (sin porcentaje de calidad y sin resumen de OpenMetadata).
  }

  return buildUncertifiedLineage(target, metric, options);
}

export function findCanonicalMetricByKey(key: string): CanonicalMetricDefinition | null {
  return CANONICAL_METRICS_BY_KEY[key] ?? null;
}
