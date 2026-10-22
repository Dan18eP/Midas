/**
 * Midas Canvas — Cliente HTTP del catálogo de identidades Zero-Trust (HU-FRONT-08).
 *
 * Contrato real del backend (FastAPI):
 *   GET /api/v1/auth/roles
 *   → 200 [ { role_id, title, description, canvas_effect,
 *              ranger_row_filter, ranger_column_mask,
 *              allowed_nodes[], locked_nodes[] } ]
 *
 * Referencia: src/api/routes/auth.py → CANONICAL_ROLES / ZeroTrustRole.
 * No se inventa ningún campo: el parser valida y estrecha el payload real.
 */

const DEFAULT_API_BASE = 'http://localhost:8000';

export const SECURITY_API_BASE = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE;
export const SECURITY_ROLES_PATH = '/api/v1/auth/roles';
export const SECURITY_ROLES_TIMEOUT_MS = 2500;

/** Cabecera que el Gateway lee para resolver el rol efectivo (ver src/api/middleware.py). */
export const USER_ROLE_HEADER = 'X-User-Role';

let currentActiveRole: string = 'director_general';

/**
 * Actualiza el rol de usuario activo para propagación transparente mediante X-User-Role.
 */
export function setActiveUserRole(role: string): void {
  currentActiveRole = role;
}

/**
 * Obtiene el rol de usuario activo para inyección en encabezados HTTP.
 */
export function getActiveUserRole(): string {
  return currentActiveRole;
}

export class SecurityRolesError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SecurityRolesError';
    this.status = status;
  }
}

/** Identidad canónica declarada por el catálogo de identidades del backend. */
export interface SecurityRoleDefinition {
  role_id: string;
  title: string;
  description: string;
  canvas_effect: string;
  ranger_row_filter?: string | null;
  ranger_column_mask?: string | null;
  allowed_nodes: string[];
  locked_nodes: string[];
}

export interface FetchSecurityRolesOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Valida y estrecha una identidad devuelta por el catálogo de identidades. */
export function parseSecurityRole(raw: unknown): SecurityRoleDefinition | null {
  if (!isRecord(raw)) return null;
  const roleId = optionalText(raw.role_id);
  if (!roleId) return null;

  return {
    role_id: roleId,
    title: optionalText(raw.title) ?? roleId,
    description: optionalText(raw.description) ?? '',
    canvas_effect: optionalText(raw.canvas_effect) ?? '',
    ranger_row_filter: optionalText(raw.ranger_row_filter),
    ranger_column_mask: optionalText(raw.ranger_column_mask),
    allowed_nodes: toStringArray(raw.allowed_nodes),
    locked_nodes: toStringArray(raw.locked_nodes),
  };
}

/** Descarga las identidades Zero-Trust declaradas por el backend. */
export async function fetchSecurityRoles(
  options: FetchSecurityRolesOptions = {},
): Promise<SecurityRoleDefinition[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? SECURITY_ROLES_TIMEOUT_MS,
  );
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  let response: Response;
  try {
    response = await fetchImpl(`${SECURITY_API_BASE}${SECURITY_ROLES_PATH}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new SecurityRolesError(
      'El catálogo de identidades Zero-Trust no está disponible: no se pudo contactar al Gateway.',
    );
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
    const detail = isRecord(payload) && typeof payload.detail === 'string' ? payload.detail : '';
    throw new SecurityRolesError(
      detail || `El catálogo de identidades respondió con HTTP ${response.status}.`,
      response.status,
    );
  }

  if (!Array.isArray(payload)) {
    throw new SecurityRolesError('El catálogo de identidades devolvió un payload no interpretable.');
  }

  return payload
    .map((role) => parseSecurityRole(role))
    .filter((role): role is SecurityRoleDefinition => role !== null);
}
