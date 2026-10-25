'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Shield, LockKeyhole, EyeOff, X, BadgeCheck, CircleSlash } from 'lucide-react';
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
    label: 'Data Admin',
    short: 'Admin',
    badge: 'admin',
    summary: 'Acceso irrestricto de administración a todas las capas del Lakehouse, DDL/DML y orquestación Airflow.',
  },
  rbac: {
    label: 'Data Analyst',
    short: 'Analyst',
    badge: 'analyst',
    summary: 'Acceso analítico a Silver y Gold con enmascaramiento dinámico de PII en columnas sensibles.',
  },
  compliance: {
    label: 'Data Steward',
    short: 'Steward',
    badge: 'steward',
    summary: 'Auditoría de gobernanza, inspección de cuarentena, linaje y contratos WAP.',
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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Manejo de tecla Escape para cerrar el modal
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  // Cierre al hacer clic fuera del contenido del modal
  useEffect(() => {
    if (!isModalOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsModalOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModalOpen]);

  // Renderizado de la tarjeta de previsualización PII
  const renderPreviewCard = () => (
    <div
      data-testid="zero-trust-lens-preview"
      className="w-full rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-3.5 shadow-xs"
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

  if (preview) {
    return (
      <div className="w-[300px] rounded-xl border border-[#E8E4DC] bg-[#FFFFFF]/95 p-3.5 shadow-[0_4px_20px_rgba(40,30,10,0.08)] backdrop-blur-md">
        {renderPreviewCard()}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" data-testid="zero-trust-role-selector">
      <div className="flex items-center gap-1 rounded-md border border-[#E8E4DC] bg-[#FAFAFA] p-1 shadow-xs">
        {/* Botón que despliega el modal en el Header */}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          title="Ver detalles de políticas y enmascaramiento Zero-Trust"
          aria-label="Abrir detalles de Lens Zero-Trust"
          data-testid="open-zero-trust-modal"
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[#B8860B] hover:bg-[#FBF8EF] hover:text-[#8C6D1F] transition-colors border border-transparent hover:border-[#D4AF37]/40 cursor-pointer"
        >
          <Shield className="h-3.5 w-3.5 text-[#B8860B]" />
          <span className="text-[10px] font-mono font-semibold text-[#8C6D1F]">
            {profile.short}
          </span>
        </button>

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

      {/* Modal Desplegable de Lens Zero-Trust desde el Header */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="zero-trust-modal-title"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1C1E21]/45 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div
            ref={modalRef}
            className="relative w-full max-w-md rounded-2xl border border-[#E8E4DC] bg-[#FFFFFF] p-5 shadow-[0_24px_70px_rgba(40,30,10,0.18)] text-[#1C1E21] animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-[#F0EDE7] pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-[#FBF8EF] p-2 text-[#B8860B] border border-[#D4AF37]/40">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <h3 id="zero-trust-modal-title" className="font-serif text-sm font-semibold text-[#1C1E21]">
                    Lens Zero-Trust — Gobernanza & PII
                  </h3>
                  <p className="text-[11px] text-[#787164]">
                    Políticas activas de Apache Ranger y control de visibilidad
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Cerrar modal"
                className="rounded-lg p-1.5 text-[#787164] hover:bg-[#F7F7F5] hover:text-[#1C1E21] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Selector de Rol dentro del Modal */}
            <div className="mb-4">
              <label className="block text-[11px] font-medium text-[#787164] mb-1.5">
                Seleccionar perfil de seguridad:
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#FAFAFA] border border-[#E8E4DC]">
                {Object.entries(PROFILES).map(([key, value]) => {
                  const pKey = key as ZeroTrustRole;
                  const isActive = role === pKey;
                  return (
                    <button
                      key={pKey}
                      type="button"
                      onClick={() => onRoleChange?.(pKey)}
                      className={`rounded-md px-2 py-1.5 text-[10px] font-medium text-center transition-all ${
                        isActive
                          ? 'bg-[#FFFFFF] text-[#8C6D1F] border border-[#D4AF37]/60 font-semibold shadow-xs'
                          : 'text-[#787164] hover:text-[#1C1E21] hover:bg-[#F0EDE7]'
                      }`}
                    >
                      {value.short}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contenido de la Previsualización PII */}
            {renderPreviewCard()}

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-[#F0EDE7] flex justify-end">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg px-4 py-1.5 text-xs font-medium text-[#787164] hover:text-[#1C1E21] hover:bg-[#F7F7F5] transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
