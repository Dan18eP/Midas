import { CANONICAL_METRICS_BY_KEY, matchCanonicalMetric, type CanonicalMetricDefinition } from './canonicalMetrics';
import { fetchTableLineage } from './lineageApi';
import { formatFigureValue } from './parseFigure';
import type {
  ExplainTarget,
  LineageCertification,
  LineageGatewayPayload,
  LineageStageNode,
  NumberLineage,
} from './types';

const LAYER_ORDER: LineageStageNode['layer'][] = ['source', 'bronze', 'silver', 'gold'];

const LAYER_FALLBACK: Record<LineageStageNode['layer'], LineageStageNode> = {
  source: {
    layer: 'source',
    title: 'Fuente Original',
    table: 'public.pedidos_crm',
    location: 'midas-postgres:5432/midas_operational',
    detail: 'Fuente operacional registrada por el motor de ingesta universal.',
  },
  bronze: {
    layer: 'bronze',
    title: 'Bronze Parquet',
    table: 'bronze.pedidos_raw',
    location: 's3://midas-bronze/pedidos_raw/',
    detail: 'Ingesta cruda inmutable Iceberg v2 Parquet con envoltorio de auditoría.',
  },
  silver: {
    layer: 'silver',
    title: 'Silver Cleanse',
    table: 'silver.pedidos',
    location: 's3://midas-silver/pedidos/',
    detail: 'Quality Gates aprobados y cuarentena de registros inválidos.',
  },
  gold: {
    layer: 'gold',
    title: 'Gold Mart',
    table: 'gold.fact_ventas',
    location: 's3://midas-gold/fact_ventas/',
    detail: 'Mart dimensional gobernado con promoción Write-Audit-Publish.',
  },
};

export const CANONICAL_QUALITY_PERCENT = null;
export const CANONICAL_QUALITY_SUMMARY = 'Data quality has not been verified';

/** FNV-1a 64-bit determinístico para trazas de auditoría locales (sin red). */
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

function resolveGoldTable(target: ExplainTarget, metric: CanonicalMetricDefinition | null): string {
  if (target.goldTableHint) return target.goldTableHint;
  const goldStage = metric?.stages.find((stage) => stage.layer === 'gold');
  return goldStage?.table ?? LAYER_FALLBACK.gold.table;
}

function buildCertification(
  lastSyncIso: string,
  auditHash: string,
  auditHashSource: LineageCertification['auditHashSource'],
  now: Date,
  overrides: { qualityPercent?: number | null; qualitySummary?: string } = {},
): LineageCertification {
  return {
    qualityPercent: overrides.qualityPercent ?? CANONICAL_QUALITY_PERCENT,
    qualitySummary: overrides.qualitySummary ?? CANONICAL_QUALITY_SUMMARY,
    lastSyncIso,
    freshnessLabel: lastSyncIso ? formatRelativeFreshness(lastSyncIso, now) : 'Data freshness has not been verified',
    auditHash,
    auditHashSource,
  };
}

export function buildFallbackLineage(
  target: ExplainTarget,
  metric: CanonicalMetricDefinition | null,
  options: { lastSyncIso: string; now?: Date },
): NumberLineage {
  const now = options.now ?? new Date();
  const goldTable = resolveGoldTable(target, metric);
  const auditHash = deriveAuditHash(`${metric?.key ?? 'unclassified'}|${goldTable}|${options.lastSyncIso}`);

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
    certification: buildCertification('', auditHash, 'derived-local', now),
    provenance: 'canonical-fallback',
    requestedAtIso: now.toISOString(),
  };
}

function mapGatewayStage(raw: Record<string, unknown>): LineageStageNode | null {
  const layer = String(raw.layer ?? '').toLowerCase() as LineageStageNode['layer'];
  if (!LAYER_ORDER.includes(layer)) return null;
  return {
    layer,
    title: String(raw.title ?? LAYER_FALLBACK[layer].title),
    table: String(raw.table ?? LAYER_FALLBACK[layer].table),
    location: String(raw.location ?? LAYER_FALLBACK[layer].location),
    detail: String(raw.description ?? raw.detail ?? LAYER_FALLBACK[layer].detail),
  };
}

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
  const lastSyncIso = typeof certification.last_sync === 'string' && certification.last_sync
    ? certification.last_sync
    : options.lastSyncIso;
  const auditHash =
    typeof certification.audit_hash === 'string' && certification.audit_hash
      ? certification.audit_hash
      : deriveAuditHash(`${metric?.key ?? 'unclassified'}|${payload.table ?? ''}|${lastSyncIso}`);

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
    transformation: payload.transformation || metric?.transformation || 'Transformación reportada por OpenMetadata.',
    certification: buildCertification(
      lastSyncIso,
      auditHash,
      certification.audit_hash ? 'gateway' : 'derived-local',
      now,
      {
        qualityPercent:
          typeof certification.quality_percent === 'number' && Number.isFinite(certification.quality_percent)
            ? certification.quality_percent
            : undefined,
        qualitySummary:
          typeof certification.quality_summary === 'string' && certification.quality_summary
            ? certification.quality_summary
            : undefined,
      },
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

export async function resolveNumberLineage(
  target: ExplainTarget,
  options: ResolveLineageOptions,
): Promise<NumberLineage> {
  const metric = matchCanonicalMetric(target.label);

  // Sin métrica certificada ni hint de tabla del agente no se consulta el gateway:
  // el linaje de una tabla no certificaría la cifra clickeada.
  if (!metric && !target.goldTableHint) {
    return buildFallbackLineage(target, metric, options);
  }

  const goldTable = resolveGoldTable(target, metric);
  const fetchImpl = options.fetchImpl ?? fetchTableLineage;

  try {
    const payload = await fetchImpl(goldTable, { signal: options.signal });
    const fromGateway = mapGatewayLineage(payload, target, metric, options);
    if (fromGateway) return fromGateway;
  } catch {
    // Gateway de HU-GOV-01 aún no desplegado: se resuelve con el diccionario canónico local.
  }

  return buildFallbackLineage(target, metric, options);
}

export function findCanonicalMetricByKey(key: string): CanonicalMetricDefinition | null {
  return CANONICAL_METRICS_BY_KEY[key] ?? null;
}
