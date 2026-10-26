'use client';

import { ReactNode } from 'react';
import { AlertTriangle, Info, Sparkles, User } from 'lucide-react';
import {
  FIGURE_TOKEN_PATTERN,
  MetricFigure,
  buildExplainTarget,
  useOptionalExplainNumber,
} from '@/components/lineage';
import { EChartsRenderer } from './EChartsRenderer';
import { TextToGoldApprovalCard } from './TextToGoldApprovalCard';
import { formatChartValue, optionToTable } from './chartOptions';
import type { CopilotMessage, CopilotMetricSummary } from './types';

interface InlineFigureContext {
  messageId: string;
  messageTimestampIso: string;
  metricsSummary?: CopilotMetricSummary[];
}

const INLINE_PATTERN = new RegExp(`(\\*\\*[^*]+\\*\\*|\`[^\`]+\`|${FIGURE_TOKEN_PATTERN})`, 'g');

function renderInline(text: string, keyBase: string, figures?: InlineFigureContext): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match = INLINE_PATTERN.exec(text);

  while (match !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={`${keyBase}-b-${match.index}`} className="font-semibold text-[#1C1E21]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      parts.push(
        <code
          key={`${keyBase}-c-${match.index}`}
          className="rounded border border-[#F0EDE7] bg-[#FAFAFA] px-1 py-0.5 font-mono text-[10px] text-[#B8860B]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (figures) {
      parts.push(
        <MetricFigure
          key={`${keyBase}-f-${match.index}`}
          token={token}
          messageId={figures.messageId}
          messageTimestampIso={figures.messageTimestampIso}
          metricsSummary={figures.metricsSummary}
        />,
      );
    } else {
      parts.push(token);
    }
    lastIndex = match.index + token.length;
    match = INLINE_PATTERN.exec(text);
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().endsWith('|') && line.trim().length > 2;
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line.trim());
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function Narrative({ content, figures }: { content: string; figures?: InlineFigureContext }) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableRow(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      const bodyRows = tableLines.filter((row, rowIndex) => !(rowIndex === 1 && isSeparatorRow(row)));
      const header = splitRow(bodyRows[0] ?? '');
      const rows = bodyRows.slice(1).map(splitRow);
      blocks.push(
        <div key={`table-${key}`} className="overflow-auto rounded-lg border border-[#E8E4DC] bg-[#FFFFFF]">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th
                    key={`th-${cellIndex}`}
                    className="whitespace-nowrap border-b border-[#F0EDE7] bg-[#FAFAFA] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#4B4639]"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`tr-${rowIndex}`} className="border-b border-[#F0EDE7]">
                  {row.map((cell, cellIndex) => (
                    <td key={`td-${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-2.5 py-1.5 text-[#1C1E21]">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      key += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${key}`} className="ml-4 list-disc space-y-1 marker:text-[#B8860B]">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`} className="text-[#1C1E21]">
              {renderInline(item, `li-${key}-${itemIndex}`, figures)}
            </li>
          ))}
        </ul>,
      );
      key += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${key}`} className="ml-4 list-decimal space-y-1 marker:text-[#B8860B]">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`} className="text-[#1C1E21]">
              {renderInline(item, `ol-${key}-${itemIndex}`, figures)}
            </li>
          ))}
        </ol>,
      );
      key += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={`h-${key}`} className="pt-1 text-[12px] font-bold text-[#1C1E21]">
          {renderInline(heading[2], `h-${key}`, figures)}
        </p>,
      );
      key += 1;
      index += 1;
      continue;
    }

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    blocks.push(
      <p key={`p-${key}`} className="text-[#1C1E21]">
        {renderInline(line, `p-${key}`, figures)}
      </p>,
    );
    key += 1;
    index += 1;
  }

  return <div className="space-y-2">{blocks}</div>;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export interface ChatMessageProps {
  message: CopilotMessage;
  onSuggestion?: (text: string) => void;
  onApprove?: (messageId: string) => void;
}

export function ChatMessage({ message, onSuggestion, onApprove }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const hasChart = Boolean(message.echartsOption);
  const metrics = message.metricsSummary ?? [];
  const preview = hasChart ? optionToTable(message.echartsOption) : null;
  const explain = useOptionalExplainNumber();
  const figures: InlineFigureContext | undefined =
    !isUser && explain
      ? { messageId: message.id, messageTimestampIso: message.timestamp, metricsSummary: metrics }
      : undefined;

  return (
    <article
      data-testid={`chat-message-${message.role}`}
      data-message-id={message.id}
      className={`flex w-full gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <span
          className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            message.error
              ? 'border border-rose-200 bg-rose-50 text-rose-600'
              : 'border border-[#D4AF37]/40 bg-[#FBF8EF] text-[#B8860B]'
          }`}
        >
          {message.error ? <AlertTriangle className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5 text-[#B8860B]" />}
        </span>
      )}

      <div className={`flex max-w-[85%] flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
            isUser
              ? 'rounded-br-sm border border-[#D4AF37]/50 bg-[#FBF8EF] text-[#1C1E21]'
              : message.error
                ? 'rounded-bl-sm border border-rose-200 bg-rose-50/70 text-rose-800'
                : 'rounded-bl-sm border border-[#E8E4DC] bg-[#FFFFFF] text-[#1C1E21] shadow-sm'
          }`}
        >
          <Narrative content={message.content} figures={figures} />
        </div>

        {!isUser && metrics.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="metrics-summary-chips">
            {metrics.slice(0, 4).map((metric, index) => {
              const label = String(metric.label ?? metric.name ?? `Métrica ${index + 1}`);
              const value = metric.value === undefined || metric.value === null ? '—' : formatChartValue(metric.value);
              const description = typeof metric.description === 'string' ? metric.description : label;
              const chipContent = (
                <>
                  <Info className="h-3 w-3 text-[#B8860B]" />
                  {label}
                  <span className="font-bold text-[#B8860B]">
                    {value}
                    {metric.unit ? ` ${metric.unit}` : ''}
                  </span>
                </>
              );
              if (!explain) {
                return (
                  <span
                    key={`${label}-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border border-[#F0EDE7] bg-[#FAFAFA] px-2 py-1 font-mono text-[10px] text-[#4B4639]"
                    title={description}
                  >
                    {chipContent}
                  </span>
                );
              }
              return (
                <button
                  key={`${label}-${index}`}
                  type="button"
                  data-testid="metrics-chip"
                  title="Explícame esta cifra"
                  aria-label={`Explícame esta cifra ${label}`}
                  onClick={() =>
                    explain.open(
                      buildExplainTarget({
                        messageId: message.id,
                        messageTimestampIso: message.timestamp,
                        label,
                        rawValue: metric.value ?? null,
                        unit: metric.unit,
                        description,
                        metricsSummary: metrics,
                      }),
                    )
                  }
                  className="inline-flex cursor-help items-center gap-1 rounded-md border border-[#F0EDE7] bg-[#FAFAFA] px-2 py-1 font-mono text-[10px] text-[#4B4639] transition-colors hover:border-[#D4AF37] hover:bg-[#FBF8EF] hover:text-[#B8860B]"
                >
                  {chipContent}
                </button>
              );
            })}
          </div>
        )}

        {!isUser && hasChart && (
          <div className="flex flex-col gap-2">
            <EChartsRenderer option={message.echartsOption} fileName={`midas-${message.intent ?? 'consulta'}`} />
            {onApprove && !message.textToGold && (
              <button
                type="button"
                data-testid="optimize-gold-button"
                onClick={() => onApprove(message.id)}
                className="self-start flex items-center gap-1.5 rounded-lg border border-[#D4AF37] bg-[#FFFDF5] px-3 py-1.5 text-xs font-semibold text-[#8C6D1F] hover:bg-[#FBF8EF] hover:border-[#B8860B] transition-all shadow-2xs cursor-pointer active:scale-95"
                title="Convertir esta consulta analítica en una tabla Gold permanente y programada en Airflow"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#B8860B]" />
                <span>★ Optimizar y Materializar como Capa Gold</span>
              </button>
            )}
          </div>
        )}

        {!isUser && message.textToGold && onApprove && (
          <TextToGoldApprovalCard
            state={message.approvalState}
            preview={preview && preview.rows.length > 0 ? preview : null}
            onApprove={() => onApprove(message.id)}
          />
        )}

        {!isUser && message.needsClarification && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/50 bg-[#FBF8EF] px-2.5 py-1 text-[10px] font-medium text-[#B8860B]">
            <AlertTriangle className="h-3 w-3" />
            Requiere aclaración para continuar
          </span>
        )}

        <span className="px-1 font-mono text-[9px] text-[#4B4639]/60">{formatTime(message.timestamp)}</span>
      </div>

      {isUser && (
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E8E4DC] bg-[#FAFAFA] text-[#4B4639]">
          <User className="h-3.5 w-3.5" />
        </span>
      )}
    </article>
  );
}
