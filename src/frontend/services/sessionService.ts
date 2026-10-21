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

const DEFAULT_API_BASE = 'http://localhost:8000';
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE;

export class SessionServiceError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SessionServiceError';
    this.status = status;
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

  const response = await fetch(`${API_BASE}/api/v1/sessions?${params.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
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
  const response = await fetch(`${API_BASE}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const response = await fetch(`${API_BASE}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
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
  const response = await fetch(
    `${API_BASE}/api/v1/sessions/${encodeURIComponent(sessionId)}/topology`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
  const response = await fetch(`${API_BASE}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
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

  const response = await fetch(`${API_BASE}/api/v1/connections/upload`, {
    method: 'POST',
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
  const response = await fetch(`${API_BASE}/api/v1/connections/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  return handleResponse<Record<string, unknown>>(response);
}

/**
 * Lista las conexiones de fuentes registradas en el catálogo backend.
 */
export async function listSourceConnections(signal?: AbortSignal): Promise<Array<{ connection_id: string; name: string; source_type: string; status: string }>> {
  const response = await fetch(`${API_BASE}/api/v1/connections`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });

  return handleResponse(response);
}

/**
 * Dispara la ejecución del pipeline para una fuente de datos en caliente.
 */
export async function triggerPipeline(
  connectionId: string,
  signal?: AbortSignal
): Promise<{ run_id: string; status: string; records_cleaned: number; records_quarantined: number; detail: string }> {
  const response = await fetch(`${API_BASE}/api/v1/pipelines/${encodeURIComponent(connectionId)}/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });

  return handleResponse(response);
}
