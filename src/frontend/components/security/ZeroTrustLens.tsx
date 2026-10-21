'use client';

import React from 'react';
import { Shield, LockKeyhole, EyeOff, BadgeCheck, CircleSlash } from 'lucide-react';
import type { SecurityRoleDefinition } from '@/services/securityRolesApi';

export type ZeroTrustRole = 'admin' | 'rbac' | 'compliance';

/**
 * Identificador canónico de la identidad en el backend (`GET /api/v1/auth/roles`).
 * El frontend conserva su propia etiqueta de producto, pero **propaga el
 * `role_id` real** al Gateway mediante la cabecera `X-User-Role`.
 */
export const ZERO_TRUST_ROLE_IDS: Record<ZeroTrustRole, string> = {
  admin: 'director_general',
  rbac: 'gerente_norte',
  compliance: 'analista_externo',
};

/**
 * Política de acceso por nodo derivada del catálogo de identidades del backend.
 * Es la fuente de verdad de la atenuación visual del Canvas.
 */
export interface SecurityNodePolicy {
  roleId: string;
  title: string;
  allowedNodes: string[];
  lockedNodes: string[];
}

/** Construye la política de nodos a partir de la identidad publicada por el backend. */
export function buildSecurityNodePolicy(
  definition: SecurityRoleDefinition,
): SecurityNodePolicy {
  return {
    roleId: definition.role_id,
    title: definition.title,
    allowedNodes: [...definition.allowed_nodes],
    lockedNodes: [...definition.locked_nodes],
  };
}

/**
 * Perfiles de respaldo. **No son la fuente de verdad**: si el catálogo de
 * identidades del backend responde, sus identidades prevalecen. Sirven para
 * mantener la consola operativa cuando el Gateway no está disponible.
 */
export const PROFILES: Record<
  ZeroTrustRole,
  { label: string; short: string; badge: string; summary: string }
> = {
  admin: {
    label: 'Director General',
    short: 'Admin',
    badge: 'admin',
    summary: 'Acceso total a las métricas de negocio y control operacional.',
  },
  rbac: {
    label: 'Gerente Regional Norte',
    short: 'RBAC',
    badge: 'rbac',
    summary: 'Acceso segmentado por región y responsabilidades de liderazgo.',
  },
  compliance: {
    label: 'Auditor de Cumplimiento',
    short: 'Compliance',
    badge: 'compliance',
    summary: 'Observación de evidencias regulatorias y controles de la plataforma.',
  },
};

interface ZeroTrustLensProps {
  role: ZeroTrustRole;
  onRoleChange?: (role: ZeroTrustRole) => void;
  preview?: boolean;
  /**
   * Identidad real publicada por `GET /api/v1/auth/roles`. Cuando está presente,
   * la Lente refleja el catálogo del backend; en su ausencia usa el respaldo
   * local **declarando que no hay evidencia disponible**.
   */
  roleDefinition?: SecurityRoleDefinition | null;
}

export const ZeroTrustLens = ({
  role,
  onRoleChange,
  preview = false,
  roleDefinition = null,
}: ZeroTrustLensProps) => {
  const profile = PROFILES[role];
  const hasBackendEvidence = Boolean(roleDefinition);

  const roleLabel = roleDefinition?.title ?? profile.label;
  const policyRowFilter = roleDefinition?.ranger_row_filter ?? null;
  const policyColumnMask = roleDefinition?.ranger_column_mask ?? null;
  const allowedCount = roleDefinition?.allowed_nodes.length ?? null;
  const totalKnownNodes = roleDefinition
    ? roleDefinition.allowed_nodes.length + roleDefinition.locked_nodes.length
    : null;

  if (preview) {
    return (
      <div
        data-testid="zero-trust-lens-preview"
        className="w-[300px] rounded-xl border border-[#E8E4DC] bg-[#FFFFFF]/95 p-3.5 shadow-[0_4px_20px_rgba(40,30,10,0.08)] backdrop-blur-md"
      >
        <div className="mb-2.5 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-[#787164]">
          <span className="flex items-center gap-1.5 font-medium">
            <Shield className="h-3.5 w-3.5 text-[#B8860B]" />
            Lens Zero-Trust
          </span>
          <span className="rounded border border-[#D4AF37]/40 bg-[#FBF8EF] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#8C6D1F]">
            {profile.short}
          </span>
        </div>

        <div className="space-y-2">
          {/* Tarjeta de Estado de Acceso */}
          <div className="rounded-lg border border-[#F0EDE7] bg-[#FAFAFA] p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[10px] text-[#787164]">
              <span>Estado de acceso</span>
              <span className="font-mono font-semibold text-[#1C1E21]" data-testid="profile-label">
                {roleLabel}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="inline-flex items-center gap-1 rounded border border-[#4D7C0F]/30 bg-[#4D7C0F]/10 px-1.5 py-0.5 font-mono text-[9px] font-medium text-[#4D7C0F]">
                <Shield className="h-2.5 w-2.5" />
                {role === 'admin' ? 'Visibilidad completa' : role === 'rbac' ? 'RLS activo' : 'Auditoría habilitada'}
              </span>
              <span
                className="font-mono text-xs font-bold text-[#8C6D1F]"
                data-testid="profile-visibility"
              >
                {allowedCount !== null && totalKnownNodes !== null
                  ? `${allowedCount}/${totalKnownNodes} nodos`
                  : 'Sin datos'}
              </span>
            </div>
            {!hasBackendEvidence && (
              <p
                className="mt-2 rounded border border-dashed border-[#D4AF37]/40 bg-[#FBF8EF] px-2 py-1 text-[9px] font-mono leading-relaxed text-[#8C6D1F]"
                data-testid="mask-evidence-missing"
              >
                Sin evidencia del backend: el catálogo de identidades no respondió.
              </p>
            )}
          </div>

          {/* Tarjeta de Política de Enmascaramiento (dato real, no simulado) */}
          <div className="rounded-lg border border-[#F0EDE7] bg-[#FAFAFA] p-2.5 text-[10px] text-[#4B4639]">
            <div className="mb-2 flex items-center justify-between text-[#787164]">
              <span>Política de enmascaramiento</span>
              <span className="font-mono font-semibold text-[#1C1E21]" data-testid="masking-status">
                {policyColumnMask ? 'Declarada' : 'No declarada'}
              </span>
            </div>
            <div className="space-y-1.5 font-mono text-[10px]">
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0 text-[#787164]">Máscara de columna</span>
                <span
                  className="break-all text-right font-semibold text-[#1C1E21]"
                  data-testid="mask-column-policy"
                >
                  {policyColumnMask ?? 'Sin política declarada'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0 text-[#787164]">Filtro de fila</span>
                <span
                  className="break-all text-right font-semibold text-[#1C1E21]"
                  data-testid="mask-row-filter"
                >
                  {policyRowFilter ?? 'Sin filtro declarado'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0 text-[#787164]">Aplicación</span>
                <span
                  className="inline-flex items-center gap-1 text-right font-semibold text-[#A8422B]"
                  data-testid="mask-evidence"
                >
                  <CircleSlash className="h-3 w-3" />
                  Sin evidencia verificable
                </span>
              </div>
            </div>
            <p className="mt-2 flex items-start gap-1 text-[9px] leading-relaxed text-[#787164]">
              <BadgeCheck className="mt-0.5 h-3 w-3 shrink-0 text-[#B8860B]" />
              El Gateway no expone metadatos de masking aplicado; sólo se muestra la política
              declarada por el catálogo de identidades.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" data-testid="zero-trust-role-selector">
      <div className="flex items-center gap-1 rounded-md border border-[#E8E4DC] bg-[#FAFAFA] p-1 shadow-xs">
        <div className="flex items-center pl-1.5 pr-1 text-[#B8860B]">
          <Shield className="h-3.5 w-3.5" />
        </div>
        <div className="flex items-center gap-1">
          {Object.entries(PROFILES).map(([key, value]) => {
            const profileKey = key as ZeroTrustRole;
            const isActive = role === profileKey;

            return (
              <button
                key={profileKey}
                type="button"
                aria-pressed={isActive}
                data-testid={`role-btn-${profileKey}`}
                onClick={() => onRoleChange?.(profileKey)}
                className={`rounded px-2.5 py-1 text-[10px] font-medium transition-all ${
                  isActive
                    ? 'border border-[#D4AF37]/60 bg-[#FFFFFF] font-semibold text-[#8C6D1F] shadow-xs'
                    : 'border border-transparent text-[#787164] hover:bg-[#F0EDE7] hover:text-[#1C1E21]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {isActive ? (
                    <LockKeyhole className="h-3 w-3 text-[#B8860B]" />
                  ) : (
                    <EyeOff className="h-3 w-3 text-[#787164]" />
                  )}
                  {value.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
