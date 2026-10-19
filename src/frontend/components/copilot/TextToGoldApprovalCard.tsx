'use client';

import { CheckCircle2, Loader2, PlaneTakeoff, RefreshCw, TableProperties } from 'lucide-react';
import type { CopilotApprovalState, CopilotChartTable } from './types';
import { TEXT_TO_GOLD_BUTTON_LABEL } from './textToGold';

export interface TextToGoldApprovalCardProps {
  state?: CopilotApprovalState;
  preview?: CopilotChartTable | null;
  onApprove: () => void;
}

const STATE_COPY: Record<Exclude<CopilotApprovalState, undefined>, { label: string; hint: string }> = {
  idle: {
    label: TEXT_TO_GOLD_BUTTON_LABEL,
    hint: 'La especificación declarativa se enviará a s3://midas-governance/airflow-specs/ y Airflow desplegará el DAG dinámico.',
  },
  submitting: {
    label: 'Materializando pipeline...',
    hint: 'Confirmando la materialización Gold con el agente...',
  },
  approved: {
    label: 'Pipeline aprobado',
    hint: 'Solicitud enviada al Copiloto para materializar la vista Gold en Airflow.',
  },
  failed: {
    label: 'Reintentar aprobación',
    hint: 'No se pudo confirmar la aprobación. Reintenta o revisa la conexión con midas-api.',
  },
};

export function TextToGoldApprovalCard({ state = 'idle', preview, onApprove }: TextToGoldApprovalCardProps) {
  const copy = STATE_COPY[state];
  const isBusy = state === 'submitting';
  const isDone = state === 'approved';
  const previewTable =
    preview && preview.rows.length > 0
      ? { columns: preview.columns, rows: preview.rows.slice(0, 5), total: preview.rows.length }
      : null;

  return (
    <div
      className="overflow-hidden rounded-xl border border-amber-600/40 bg-gradient-to-br from-amber-950/50 to-slate-950/70"
      data-testid="text-to-gold-card"
      data-approval-state={state}
    >
      <div className="flex items-center gap-2 border-b border-amber-700/30 bg-amber-950/40 px-3 py-2">
        <PlaneTakeoff className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-[11px] font-semibold text-amber-200">Propuesta Text-to-Gold</span>
        <span className="ml-auto rounded bg-slate-950/70 px-1.5 py-0.5 font-mono text-[9px] text-amber-400">
          Pipeline-as-a-Prompt
        </span>
      </div>

      <div className="space-y-3 p-3">
        <p className="text-[11px] leading-relaxed text-slate-300">{copy.hint}</p>

        {previewTable && (
          <div className="overflow-auto rounded-lg border border-slate-800 bg-slate-950/70">
            <table className="w-full border-collapse text-left text-[10px]" data-testid="text-to-gold-preview">
              <thead>
                <tr>
                  {previewTable.columns.map((column, index) => (
                    <th
                      key={`${column}-${index}`}
                      className="whitespace-nowrap border-b border-slate-800 px-2.5 py-1.5 font-mono uppercase tracking-wider text-slate-500"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewTable.rows.map((row, rowIndex) => (
                  <tr key={`preview-${rowIndex}`} className="border-b border-slate-800/60">
                    {row.map((cell, cellIndex) => (
                      <td key={`preview-${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-2.5 py-1 text-slate-400">
                        {String(cell ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {previewTable && (
          <p className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
            <TableProperties className="h-3 w-3" />
            Vista previa: {previewTable.rows.length} de {previewTable.total} filas
          </p>
        )}

        <button
          type="button"
          onClick={onApprove}
          disabled={isBusy || isDone}
          data-testid="approve-pipeline-button"
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-500/60 disabled:cursor-not-allowed ${
            isDone
              ? 'bg-emerald-950/70 text-emerald-300 ring-1 ring-emerald-600/40'
              : isBusy
                ? 'bg-amber-700/40 text-amber-200'
                : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
          }`}
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isDone ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : state === 'failed' ? (
            <RefreshCw className="h-4 w-4" />
          ) : null}
          {copy.label}
        </button>
      </div>
    </div>
  );
}
