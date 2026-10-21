import type { LineageGatewayPayload } from './types';

const DEFAULT_API_BASE = 'http://localhost:8000';

export const LINEAGE_API_BASE = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE;
export const LINEAGE_TABLE_PATH = '/api/v1/lineage/table';
export const LINEAGE_GATEWAY_TIMEOUT_MS = 2500;

export class LineageGatewayError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LineageGatewayError';
    this.status = status;
  }
}

function parsePayload(raw: unknown): LineageGatewayPayload | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as LineageGatewayPayload) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as LineageGatewayPayload;
  return null;
}

export async function fetchTableLineage(
  table: string,
  options: { signal?: AbortSignal; timeoutMs?: number; userRole?: string } = {},
): Promise<LineageGatewayPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? LINEAGE_GATEWAY_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  let response: Response;
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.userRole) {
      headers['X-User-Role'] = options.userRole;
    }
    response = await fetch(
      `${LINEAGE_API_BASE}${LINEAGE_TABLE_PATH}/${encodeURIComponent(table)}`,
      { method: 'GET', headers, signal: controller.signal },
    );
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new LineageGatewayError('El gateway de linaje de OpenMetadata no está disponible.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && typeof (payload as { detail?: unknown }).detail === 'string'
        ? ((payload as { detail: string }).detail)
        : '';
    throw new LineageGatewayError(detail || `El gateway de linaje respondió con HTTP ${response.status}.`, response.status);
  }

  const parsed = parsePayload(payload);
  if (!parsed) throw new LineageGatewayError('El gateway de linaje devolvió un payload no interpretable.');
  return parsed;
}
