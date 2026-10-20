'use client';

import React from 'react';
import { Shield, LockKeyhole, EyeOff } from 'lucide-react';

export type ZeroTrustRole = 'admin' | 'rbac' | 'compliance';

const PROFILES: Record<ZeroTrustRole, { label: string; short: string; badge: string; summary: string }> = {
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
}

export const ZeroTrustLens = ({ role, onRoleChange, preview = false }: ZeroTrustLensProps) => {
  const profile = PROFILES[role];

  if (preview) {
    return (
      <div className="w-[310px] rounded-2xl border border-slate-800 bg-slate-900/85 p-3 shadow-2xl shadow-slate-950/50 backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-400">
          <span className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-blue-400" />
            Lens Zero-Trust
          </span>
          <span className="rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-300">
            {profile.short}
          </span>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
            <div className="mb-2 flex items-center justify-between text-[10px] text-slate-400">
              <span>Estado de acceso</span>
              <span className="font-mono text-blue-300">{profile.label}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[10px] text-slate-300">
              <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                <Shield className="h-3 w-3" />
                {role === 'admin' ? 'Visibilidad completa' : role === 'rbac' ? 'RLS activo' : 'Auditoría habilitada'}
              </span>
              <span className="font-mono text-slate-400">{role === 'admin' ? '100%' : role === 'rbac' ? '64%' : '82%'}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-[10px] text-slate-300">
            <div className="mb-1.5 flex items-center justify-between text-slate-400">
              <span>Enmascaramiento</span>
              <span className="font-mono text-slate-200">{role === 'admin' ? 'Desactivado' : 'Activo'}</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span>Emails</span>
                <span className="font-mono text-sky-300">{role === 'admin' ? 'pepe@riwi.io' : 'u****@riwi.io'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Salarios</span>
                <span className="font-mono text-amber-300">{role === 'admin' ? '$85.000' : '****'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 shadow-lg shadow-slate-950/40">
        <Shield className="h-3.5 w-3.5 text-blue-400" />
        <div className="flex items-center gap-2.5">
          {Object.entries(PROFILES).map(([key, value]) => {
            const profileKey = key as ZeroTrustRole;
            const isActive = role === profileKey;

            return (
              <button
                key={profileKey}
                type="button"
                aria-pressed={isActive}
                onClick={() => onRoleChange?.(profileKey)}
                className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition-all ${
                  isActive
                    ? 'border-blue-500/40 bg-blue-500/15 text-blue-200 shadow-[0_0_15px_rgba(59,130,246,0.25)]'
                    : 'border-slate-700 bg-slate-950/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {isActive ? <LockKeyhole className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {value.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-[11px] text-blue-100 shadow-lg shadow-blue-950/20">
        Simulando sesión bajo perfil: {profile.label} · Políticas Ranger activas
      </div>
    </div>
  );
};
