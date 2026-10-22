import type { CopilotChatResponse, EChartsOption } from './types';
import { parseChartOption } from './chartOptions';
import { getActiveUserRole } from '@/services/securityRolesApi';

const DEFAULT_API_BASE = 'http://localhost:8000';

export const COPILOT_API_BASE = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE;
export const COPILOT_CHAT_PATH = '/api/v1/agent/chat';

export class CopilotApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CopilotApiError';
    this.status = status;
  }
}

export interface SendChatMessageInput {
  message: string;
  threadId?: string;
  userRole?: string;
  signal?: AbortSignal;
}

function unpackResponse(raw: string): { text: string; option: EChartsOption | null } {
  const trimmed = (raw ?? '').trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed.narrative === 'string') {
        return { text: parsed.narrative, option: parseChartOption(parsed.echarts_option) };
      }
    } catch {
      return { text: raw, option: null };
    }
  }
  return { text: raw, option: null };
}

export function normalizeChatResponse(payload: Partial<CopilotChatResponse>): CopilotChatResponse {
  const unpacked = unpackResponse(String(payload.response ?? ''));
  return {
    thread_id: payload.thread_id ?? '',
    intent: payload.intent ?? null,
    response: unpacked.text,
    suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
    needs_clarification: Boolean(payload.needs_clarification),
    echarts_option: parseChartOption(payload.echarts_option) ?? parseChartOption(payload.echarts_spec) ?? unpacked.option,
    metrics_summary: Array.isArray(payload.metrics_summary) ? payload.metrics_summary : [],
    timestamp: payload.timestamp,
  };
}

export async function sendChatMessage(input: SendChatMessageInput): Promise<CopilotChatResponse> {
  const body: Record<string, string> = { message: input.message };
  if (input.threadId) body.thread_id = input.threadId;

  let response: Response;
  try {
    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    const effectiveRole = input.userRole || getActiveUserRole();
    if (effectiveRole) {
      requestHeaders['X-User-Role'] = effectiveRole;
    }
    response = await fetch(`${COPILOT_API_BASE}${COPILOT_CHAT_PATH}`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (cause) {
    if ((cause as Error)?.name === 'AbortError') throw cause;
    throw new CopilotApiError('No pude conectar con el Copiloto Agéntico. Verifica que midas-api esté disponible.');
  }

  let payload: Partial<CopilotChatResponse> & { detail?: string } = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const detail = typeof payload.detail === 'string' ? payload.detail : '';
    throw new CopilotApiError(
      detail || `El Copiloto respondió con error HTTP ${response.status}.`,
      response.status,
    );
  }

  return normalizeChatResponse(payload);
}
