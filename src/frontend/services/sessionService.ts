/**
 * Midas - Servicio HTTP de Gestión de Sesiones Conversacionales y Conexiones Rápidas.
 *
 * Historia de Usuario: HU-FRONT-07 / ADR-010
 * Autor: Dilan Chávez (@dilandcv)
 * Conecta con los endpoints backend de FastAPI:
 * - GET/POST /api/v1/sessions
 * - GET/PUT/DELETE /api/v1/sessions/{session_id}
 * - POST /api/v1/connections/upload
 * - POST /api/v1/connections/register
 */

import type {
  ChatSessionDetail,
  ChatSessionSummary,
  CreateSessionDTO,
  FileUploadResponseDTO,
  RegisterConnectionDTO,
  TopologyStateDTO,
} from '@/types/session';
import { getActiveUserRole } from './securityRolesApi';

const DEFAULT_API_BASE = 'http://localhost:8000';
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE;

function getSessionHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  const role = getActiveUserRole();
  if (role) {
    headers['X-User-Role'] = role;
  }
  return headers;
}

export class SessionServiceError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SessionServiceError';
    this.status = status;
  }
}

async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('Load failed') ||
      message.includes('Network request failed')
    ) {
      throw new SessionServiceError(
        'No se pudo conectar con el servidor backend (FastAPI en http://localhost:8000). Verifique que los contenedores estén activos y accesibles.',
      );
    }
    throw err;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorDetail = `Error en petición: ${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      if (payload && typeof payload.detail === 'string') {
        errorDetail = payload.detail;
      }
    } catch {
      // Ignorar error al parsear cuerpo JSON no válido
    }
    throw new SessionServiceError(errorDetail, response.status);
  }
  return response.json();
}

/**
 * Obtiene la lista de sesiones conversacionales del usuario.
 */
export async function listSessions(
  userId?: string,
  limit: number = 50,
  offset: number = 0,
  signal?: AbortSignal
): Promise<ChatSessionSummary[]> {
  const params = new URLSearchParams();
  if (userId) params.set('user_id', userId);
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const response = await safeFetch(`${API_BASE}/api/v1/sessions?${params.toString()}`, {
    method: 'GET',
    headers: getSessionHeaders(),
    signal,
  });

  return handleResponse<ChatSessionSummary[]>(response);
}

/**
 * Inicializa una nueva sesión conversacional en PostgreSQL.
 */
export async function createSession(
  payload?: CreateSessionDTO,
  signal?: AbortSignal
): Promise<ChatSessionSummary> {
  const response = await safeFetch(`${API_BASE}/api/v1/sessions`, {
    method: 'POST',
    headers: getSessionHeaders(),
    body: JSON.stringify(payload || {}),
    signal,
  });

  return handleResponse<ChatSessionSummary>(response);
}

/**
 * Recupera el detalle completo de una sesión (mensajes + topología React Flow).
 */
export async function getSessionDetail(
  sessionId: string,
  signal?: AbortSignal
): Promise<ChatSessionDetail> {
  const response = await safeFetch(`${API_BASE}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: getSessionHeaders(),
    signal,
  });

  return handleResponse<ChatSessionDetail>(response);
}

/**
 * Persiste la topología React Flow (nodos y aristas) en el estado de la sesión.
 */
export async function updateSessionTopology(
  sessionId: string,
  topologyState: TopologyStateDTO,
  signal?: AbortSignal
): Promise<ChatSessionDetail> {
  const response = await safeFetch(
    `${API_BASE}/api/v1/sessions/${encodeURIComponent(sessionId)}/topology`,
    {
      method: 'PUT',
      headers: getSessionHeaders(),
      body: JSON.stringify({ topology_state: topologyState }),
      signal,
    }
  );

  return handleResponse<ChatSessionDetail>(response);
}

/**
 * Elimina una sesión y sus mensajes asociados del historial.
 */
export async function deleteSession(
  sessionId: string,
  signal?: AbortSignal
): Promise<{ status: string; session_id: string }> {
  const response = await safeFetch(`${API_BASE}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: getSessionHeaders(),
    signal,
  });

  return handleResponse<{ status: string; session_id: string }>(response);
}

/**
 * Carga binaria multipart/form-data de un archivo .xlsx, .xls o .csv.
 */
export async function uploadDataFile(
  file: File,
  name?: string,
  sourceType?: 'EXCEL' | 'CSV',
  signal?: AbortSignal
): Promise<FileUploadResponseDTO> {
  const formData = new FormData();
  formData.append('file', file);
  if (name) formData.append('name', name);
  if (sourceType) formData.append('source_type', sourceType);
  const headers: Record<string, string> = {};
  const role = getActiveUserRole();
  if (role) {
    headers['X-User-Role'] = role;
  }

  const response = await safeFetch(`${API_BASE}/api/v1/connections/upload`, {
    method: 'POST',
    headers,
    body: formData,
    signal,
  });

  return handleResponse<FileUploadResponseDTO>(response);
}

/**
 * Registra una conexión declarativa (REST, Webhook, JDBC PostgreSQL/MySQL).
 */
export async function registerConnection(
  payload: RegisterConnectionDTO,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const effectiveSourceType =
    payload.source_type === 'REST_API' || payload.source_type === 'WEBHOOK'
      ? 'REST'
      : payload.source_type;

  const backendPayload = {
    name: payload.name,
    source_type: effectiveSourceType,
    config_payload: payload.config_payload || {
      host: payload.host,
      port: payload.port,
      database: payload.database,
      username: payload.username,
      password: payload.password,
      url: payload.url,
      auth_type: payload.auth_type,
      auth_token: payload.auth_token,
      headers: payload.headers,
    },
  };

  const response = await safeFetch(`${API_BASE}/api/v1/connections/register`, {
    method: 'POST',
    headers: getSessionHeaders(),
    body: JSON.stringify(backendPayload),
    signal,
  });

  return handleResponse<Record<string, unknown>>(response);
}

/**
 * Lista las conexiones de fuentes registradas en el catálogo backend.
 */
export async function listSourceConnections(signal?: AbortSignal): Promise<Array<{ connection_id: string; name: string; source_type: string; status: string }>> {
  const response = await safeFetch(`${API_BASE}/api/v1/connections`, {
    method: 'GET',
    headers: getSessionHeaders(),
    signal,
  });

  return handleResponse(response);
}

export interface ConnectionTestRequestDTO {
  source_type: string;
  config_payload: Record<string, unknown>;
}

export interface ConnectionTestResponseDTO {
  success: boolean;
  latency_ms: number;
  detail: string;
}

/**
 * Ejecuta un pre-flight check de conectividad (socket TCP o llamada HTTP) sin registrar la fuente.
 */
export async function testConnection(
  payload: ConnectionTestRequestDTO,
  signal?: AbortSignal
): Promise<ConnectionTestResponseDTO> {
  const response = await safeFetch(`${API_BASE}/api/v1/connections/test`, {
    method: 'POST',
    headers: getSessionHeaders(),
    body: JSON.stringify(payload),
    signal,
  });

  return handleResponse<ConnectionTestResponseDTO>(response);
}

/**
 * Dispara la ejecución del pipeline para una fuente de datos en caliente.
 */
export async function triggerPipeline(
  connectionId: string,
  signal?: AbortSignal
): Promise<{ run_id: string; status: string; records_cleaned: number; records_quarantined: number; detail: string }> {
  const response = await safeFetch(`${API_BASE}/api/v1/pipelines/${encodeURIComponent(connectionId)}/trigger`, {
    method: 'POST',
    headers: getSessionHeaders(),
    signal,
  });

  return handleResponse(response);
}
