'use client';

import React from 'react';
import { Shield, LockKeyhole, EyeOff } from 'lucide-react';

export type ZeroTrustRole = 'admin' | 'rbac' | 'compliance';

export const PROFILES: Record<
  ZeroTrustRole,
  { label: string; short: string; badge: string; summary: string; visibility: string }
> = {
  admin: {
    label: 'Director General',
    short: 'Admin',
    badge: 'admin',
    summary: 'Acceso total a las métricas de negocio y control operacional.',
    visibility: '100%',
  },
  rbac: {
    label: 'Gerente Regional Norte',
    short: 'RBAC',
    badge: 'rbac',
    summary: 'Acceso segmentado por región y responsabilidades de liderazgo.',
    visibility: '64%',
  },
  compliance: {
    label: 'Auditor de Cumplimiento',
    short: 'Compliance',
    badge: 'compliance',
    summary: 'Observación de evidencias regulatorias y controles de la plataforma.',
    visibility: '82%',
  },
};

interface ZeroTrustLensProps {
  role: ZeroTrustRole;
  onRoleChange?: (role: ZeroTrustRole) => void;
  preview?: boolean;
}

export const ZeroTrustLens = ({ role, onRoleChange, preview = false }: ZeroTrustLensProps) => {
  const profile = PROFILES[role];

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
                {profile.label}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="inline-flex items-center gap-1 rounded border border-[#4D7C0F]/30 bg-[#4D7C0F]/10 px-1.5 py-0.5 font-mono text-[9px] font-medium text-[#4D7C0F]">
                <Shield className="h-2.5 w-2.5" />
                {role === 'admin' ? 'Visibilidad completa' : role === 'rbac' ? 'RLS activo' : 'Auditoría habilitada'}
              </span>
              <span className="font-mono text-xs font-bold text-[#8C6D1F]" data-testid="profile-visibility">
                {profile.visibility}
              </span>
            </div>
          </div>

          {/* Tarjeta de Enmascaramiento PII */}
          <div className="rounded-lg border border-[#F0EDE7] bg-[#FAFAFA] p-2.5 text-[10px] text-[#4B4639]">
            <div className="mb-2 flex items-center justify-between text-[#787164]">
              <span>Enmascaramiento PII</span>
              <span className="font-mono font-semibold text-[#1C1E21]" data-testid="masking-status">
                {role === 'admin' ? 'Desactivado' : 'Activo'}
              </span>
            </div>
            <div className="space-y-1.5 font-mono text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-[#787164]">Emails</span>
                <span className="font-semibold text-[#1C1E21]" data-testid="pii-email">
                  {role === 'admin' ? 'pepe@riwi.io' : 'u****@riwi.io'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#787164]">Salarios</span>
                <span className="font-semibold text-[#B8860B]" data-testid="pii-salary">
                  {role === 'admin' ? '$85.000' : '****'}
                </span>
              </div>
            </div>
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
