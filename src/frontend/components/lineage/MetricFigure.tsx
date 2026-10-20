'use client';

import { memo } from 'react';
import type { CopilotMetricSummary } from '../copilot/types';
import { useOptionalExplainNumber, buildExplainTargetFromText } from './ExplainNumberContext';

export interface MetricFigureProps {
  token: string;
  messageId: string;
  messageTimestampIso?: string;
  metricsSummary?: CopilotMetricSummary[];
}

/** Cifra del chat renderizada como botón interactivo que abre el drawer "Explícame esta cifra". */
export const MetricFigure = memo(function MetricFigure({
  token,
  messageId,
  messageTimestampIso,
  metricsSummary,
}: MetricFigureProps) {
  const explain = useOptionalExplainNumber();
  if (!explain) return <>{token}</>;

  return (
    <button
      type="button"
      data-testid="chat-figure"
      data-figure={token}
      aria-label={`Explícame esta cifra ${token}`}
      title="Explícame esta cifra"
      onClick={() =>
        explain.open(
          buildExplainTargetFromText({ messageId, messageTimestampIso, token, metricsSummary }),
        )
      }
      className="mx-0.5 cursor-help rounded px-0.5 text-amber-300/90 underline decoration-amber-400/40 decoration-dotted underline-offset-2 transition-colors hover:bg-amber-500/10 hover:text-amber-200 hover:decoration-amber-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-400/70"
    >
      {token}
    </button>
  );
});
