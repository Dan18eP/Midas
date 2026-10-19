'use client';

import { ReactNode } from 'react';
import { AlertTriangle, Info, Sparkles, User } from 'lucide-react';
import { EChartsRenderer } from './EChartsRenderer';
import { QuickPromptPills } from './QuickPromptPills';
import { TextToGoldApprovalCard } from './TextToGoldApprovalCard';
import { formatChartValue, optionToTable } from './chartOptions';
import type { CopilotMessage } from './types';

function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match = pattern.exec(text);

  while (match !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={`${keyBase}-b-${match.index}`} className="font-semibold text-slate-100">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <code
          key={`${keyBase}-c-${match.index}`}
          className="rounded border border-slate-800 bg-slate-950/80 px-1 py-0.5 font-mono text-[10px] text-amber-300"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = match.index + token.length;
    match = pattern.exec(text);
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

function Narrative({ content }: { content: string }) {
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
        <div key={`table-${key}`} className="overflow-auto rounded-lg border border-slate-800 bg-slate-950/60">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th
                    key={`th-${cellIndex}`}
                    className="whitespace-nowrap border-b border-slate-800 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`tr-${rowIndex}`} className="border-b border-slate-800/60">
                  {row.map((cell, cellIndex) => (
                    <td key={`td-${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-2.5 py-1.5 text-slate-400">
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
        <ul key={`ul-${key}`} className="ml-4 list-disc space-y-1 marker:text-indigo-400">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`} className="text-slate-300">
              {renderInline(item, `li-${key}-${itemIndex}`)}
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
        <ol key={`ol-${key}`} className="ml-4 list-decimal space-y-1 marker:text-indigo-400">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`} className="text-slate-300">
              {renderInline(item, `ol-${key}-${itemIndex}`)}
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
        <p key={`h-${key}`} className="pt-1 text-[12px] font-bold text-slate-100">
          {renderInline(heading[2], `h-${key}`)}
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
      <p key={`p-${key}`} className="text-slate-300">
        {renderInline(line, `p-${key}`)}
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

  return (
    <article
      data-testid={`chat-message-${message.role}`}
      data-message-id={message.id}
      className={`flex w-full gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <span
          className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            message.error ? 'bg-rose-950 text-rose-400' : 'bg-gradient-to-br from-indigo-600 to-amber-500'
          }`}
        >
          {message.error ? <AlertTriangle className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5 text-white" />}
        </span>
      )}

      <div className={`flex max-w-[85%] flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
            isUser
              ? 'rounded-br-sm bg-indigo-600/90 text-white'
              : message.error
                ? 'rounded-bl-sm border border-rose-800/60 bg-rose-950/40 text-rose-200'
                : 'rounded-bl-sm border border-slate-800 bg-slate-900/70 text-slate-300'
          }`}
        >
          <Narrative content={message.content} />
        </div>

        {!isUser && metrics.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="metrics-summary-chips">
            {metrics.map((metric, index) => {
              const label = String(metric.label ?? metric.name ?? `Métrica ${index + 1}`);
              const value = metric.value === undefined || metric.value === null ? '—' : formatChartValue(metric.value);
              return (
                <span
                  key={`${label}-${index}`}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700/80 bg-slate-950/80 px-2 py-1 font-mono text-[10px] text-slate-300"
                  title={typeof metric.description === 'string' ? metric.description : label}
                >
                  <Info className="h-3 w-3 text-indigo-400" />
                  {label}
                  <span className="font-bold text-amber-300">
                    {value}
                    {metric.unit ? ` ${metric.unit}` : ''}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {!isUser && hasChart && (
          <EChartsRenderer option={message.echartsOption} fileName={`midas-${message.intent ?? 'consulta'}`} />
        )}

        {!isUser && message.textToGold && onApprove && (
          <TextToGoldApprovalCard
            state={message.approvalState}
            preview={preview && preview.rows.length > 0 ? preview : null}
            onApprove={() => onApprove(message.id)}
          />
        )}

        {!isUser && message.needsClarification && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-600/40 bg-amber-950/40 px-2.5 py-1 text-[10px] font-medium text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            Requiere aclaración para continuar
          </span>
        )}

        {!isUser && message.suggestions && message.suggestions.length > 0 && onSuggestion && (
          <QuickPromptPills
            pills={message.suggestions.slice(0, 4)}
            onSelect={onSuggestion}
            label="Continuar con"
            testIdPrefix="message-suggestion"
          />
        )}

        <span className="px-1 font-mono text-[9px] text-slate-600">{formatTime(message.timestamp)}</span>
      </div>

      {isUser && (
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
          <User className="h-3.5 w-3.5" />
        </span>
      )}
    </article>
  );
}
