import type { CopilotMetricSummary, CopilotChatResponse } from './types';

export const TEXT_TO_GOLD_CONFIRMATION = 'Materializa este reporte como tabla Gold diaria';

export const TEXT_TO_GOLD_BUTTON_LABEL = 'Aprobar y Crear Pipeline en Airflow';

const TEXT_TO_GOLD_INTENTS = new Set([
  'text_to_gold',
  'text-to-gold',
  'gold_transform',
  'gold_transformer',
  'pipeline_as_a_prompt',
  'materialize_gold',
]);

const TEXT_TO_GOLD_PATTERNS: RegExp[] = [
  /guarde esta vista en la capa gold/i,
  /guardar esta vista en la capa gold/i,
  /programe su actualizaci[oó]n/i,
  /programar su actualizaci[oó]n/i,
  /sem[aá]foro de costo spark/i,
  /materializ\w+[^.]{0,80}gold/i,
  /nueva (?:vista|tabla|mart|capa) gold/i,
  /cre(?:ar|a|e|ó)\s+(?:el\s+)?(?:dag|pipeline)[^.]{0,60}airflow/i,
  /airflow[^.]{0,60}(?:dag|pipeline)[^.]{0,60}gold/i,
  /pipeline-as-a-prompt/i,
];

function fromIntent(intent?: string | null): boolean {
  if (!intent) return false;
  return TEXT_TO_GOLD_INTENTS.has(intent.trim().toLowerCase());
}

function fromNarrative(response?: string): boolean {
  if (!response) return false;
  return TEXT_TO_GOLD_PATTERNS.some((pattern) => pattern.test(response));
}

function fromMetrics(metrics?: CopilotMetricSummary[]): boolean {
  if (!Array.isArray(metrics)) return false;
  return metrics.some((metric) => {
    const markers = [metric.type, metric.kind, metric.intent, metric.action, metric.proposal]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLowerCase());
    return markers.some((value) => TEXT_TO_GOLD_INTENTS.has(value) || value === 'airflow_pipeline');
  });
}

export function detectTextToGoldProposal(
  payload: Pick<CopilotChatResponse, 'intent' | 'response' | 'metrics_summary'>,
): boolean {
  return fromIntent(payload.intent) || fromNarrative(payload.response) || fromMetrics(payload.metrics_summary);
}
