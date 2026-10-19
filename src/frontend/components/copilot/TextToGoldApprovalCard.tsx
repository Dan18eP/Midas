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
      className="overflow-hidden rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] shadow-sm"
      data-testid="text-to-gold-card"
      data-approval-state={state}
    >
      <div className="flex items-center gap-2 border-b border-[#F0EDE7] bg-[#FBF8EF] px-3 py-2">
        <PlaneTakeoff className="h-3.5 w-3.5 text-[#B8860B]" />
        <span className="text-[11px] font-semibold text-[#1C1E21]">Propuesta Text-to-Gold</span>
        <span className="ml-auto rounded border border-[#F0EDE7] bg-[#FFFFFF] px-1.5 py-0.5 font-mono text-[9px] text-[#B8860B]">
          Pipeline-as-a-Prompt
        </span>
      </div>

      <div className="space-y-3 p-3">
        <p className="text-[11px] leading-relaxed text-[#4B4639]">{copy.hint}</p>

        {previewTable && (
          <div className="overflow-auto rounded-lg border border-[#F0EDE7] bg-[#FAFAFA]">
            <table className="w-full border-collapse text-left text-[10px]" data-testid="text-to-gold-preview">
              <thead>
                <tr>
                  {previewTable.columns.map((column, index) => (
                    <th
                      key={`${column}-${index}`}
                      className="whitespace-nowrap border-b border-[#F0EDE7] bg-[#F7F7F5] px-2.5 py-1.5 font-mono uppercase tracking-wider text-[#4B4639]"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewTable.rows.map((row, rowIndex) => (
                  <tr key={`preview-${rowIndex}`} className="border-b border-[#F0EDE7]">
                    {row.map((cell, cellIndex) => (
                      <td key={`preview-${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-2.5 py-1 text-[#1C1E21]">
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
          <p className="flex items-center gap-1.5 font-mono text-[10px] text-[#4B4639]/70">
            <TableProperties className="h-3 w-3" />
            Vista previa: {previewTable.rows.length} de {previewTable.total} filas
          </p>
        )}

        <button
          type="button"
          onClick={onApprove}
          disabled={isBusy || isDone}
          data-testid="approve-pipeline-button"
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-bold transition focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 disabled:cursor-not-allowed ${
            isDone
              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300'
              : isBusy
                ? 'border border-[#D4AF37]/40 bg-[#FBF8EF] text-[#B8860B]'
                : 'bg-[#B8860B] text-white hover:bg-[#D4AF37]'
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
