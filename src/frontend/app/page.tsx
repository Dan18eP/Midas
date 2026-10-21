'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { CopilotChatDrawer, CopilotChatProvider, CopilotChatWidget } from '@/components/copilot';
import { ExplainNumberDrawer, ExplainNumberProvider } from '@/components/lineage';
import {
  ZERO_TRUST_ROLE_IDS,
  buildSecurityNodePolicy,
  type ZeroTrustRole,
} from '@/components/security/ZeroTrustLens';
import { fetchSecurityRoles, type SecurityRoleDefinition } from '@/services/securityRolesApi';
import { useTelemetryHistory } from '@/hooks/useTelemetryHistory';

const PipelineCanvas = dynamic(
  () => import('@/components/canvas/PipelineCanvas').then((mod) => mod.PipelineCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#FFFFFF] text-[#4B4639] font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#B8860B] animate-ping" />
          <span>Cargando Canvas Topológico Midas...</span>
        </div>
      </div>
    ),
  }
);

export default function MidasConsolePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    void fetch(`${api}/api/v1/auth/me`, { credentials: 'include' })
      .then((response) => setAuthenticated(response.ok)).catch(() => setAuthenticated(false));
  }, [api]);

  if (authenticated) return <AuthenticatedConsole />;
  return (
    <main className="flex min-h-screen items-center justify-center bg-white text-stone-900">
      <form className="flex w-80 flex-col gap-4" onSubmit={async (event) => {
        event.preventDefault();
        try {
          const response = await fetch(`${api}/api/v1/auth/login`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          if (!response.ok) throw new Error('Sign-in failed');
          setToken('');
          setAuthenticated(true);
        } catch { setError('Could not sign in. Check your operator token and API.'); }
      }}>
        <h1 className="text-xl">Sign in to Midas</h1>
        <label htmlFor="operator-token">Local operator token</label>
        <input id="operator-token" className="border p-2" type="password" value={token}
          onChange={(event) => setToken(event.target.value)} required autoComplete="off" />
        <button type="submit" className="border p-2">Sign in</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}

function AuthenticatedConsole() {
  const selectedRole: ZeroTrustRole = 'admin';

  // HU-FRONT-08: las identidades reales provienen del catálogo del backend.
  const [roleDefinitions, setRoleDefinitions] = useState<SecurityRoleDefinition[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetchSecurityRoles({ signal: controller.signal })
      .then((definitions) => {
        if (!cancelled) setRoleDefinitions(definitions);
      })
      .catch(() => {
        // Sin catálogo de identidades: la consola opera con el respaldo local
        // declarado. La Lente informa explícitamente que no hay evidencia.
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const activeRoleDefinition = useMemo(() => {
    const backendRoleId = ZERO_TRUST_ROLE_IDS[selectedRole];
    return roleDefinitions.find((definition) => definition.role_id === backendRoleId) ?? null;
  }, [roleDefinitions, selectedRole]);

  const securityPolicy = useMemo(
    () => (activeRoleDefinition ? buildSecurityNodePolicy(activeRoleDefinition) : null),
    [activeRoleDefinition],
  );

  // HU-FRONT-08: la línea de tiempo del scrubber se hidrata con el historial real.
  useTelemetryHistory();

  return (
    <ExplainNumberProvider>
      <CopilotChatProvider>
        <div className="flex h-screen w-screen flex-col bg-[#FFFFFF] text-[#1C1E21] antialiased">
          {/* 1. Header Ejecutivo Corporativo — Geometría Clásica & Precisión Técnica */}
          <header className="flex h-13 w-full items-center justify-between border-b border-[#E8E4DC] bg-[#FFFFFF] px-4 py-2.5 shadow-[0_1px_3px_rgba(40,30,10,0.03)] z-40 relative">
            {/* Marca y Subtítulo */}
            <div className="flex items-center space-x-3.5">
              <div className="w-7 h-7 rounded-md bg-[#FBF8EF] border border-[#D4AF37] flex items-center justify-center text-[#B8860B] shadow-sm">
                <span className="font-serif font-bold text-xs tracking-wider">M</span>
              </div>
              <div>
                <span className="font-serif font-semibold text-xs tracking-wider text-[#1C1E21]">MIDAS</span>
                <span className="text-[10px] font-mono text-[#787164] tracking-tight border-l border-[#E8E4DC] pl-2.5">
                  Active Lakehouse
                </span>
              </div>
            </div>

            {/* Frontera HU-FRONT-03: Time-Travel Replay Status */}
            <div className="hidden lg:flex items-center bg-[#F7F7F5] border border-[#E8E4DC] rounded-md px-2.5 py-1 text-xs shadow-inner gap-2">
              <span className="text-[10px] uppercase tracking-wider text-[#787164] font-mono font-medium">Time-Travel Replay:</span>
              <span className="flex items-center space-x-1.5 px-2 py-1 rounded bg-[#FFFFFF] text-[#1C1E21] font-medium border border-[#D4AF37]/40 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C0F] animate-pulse" />
                <span className="font-mono text-[10px] font-semibold text-[#8C6D1F]">Historial del Gateway de Telemetría</span>
              </span>
            </div>

            {/* Frontera HU-FRONT-05: Selector Zero-Trust Roles */}
            <span className="text-xs text-stone-600">Director account · Ranger policies pending</span>
          </header>

          {/* 2. Cuerpo Principal: Canvas Topológico React Flow (Full-Width) */}
          <main className="relative flex flex-1 overflow-hidden">
            <section
              aria-label="Topología del Pipeline Lakehouse"
              className="relative flex-1 h-full bg-[#FFFFFF]"
            >
              <PipelineCanvas securityRole={selectedRole} securityPolicy={securityPolicy} />
            </section>

            {/* Frontera HU-FRONT-05: Overlay Tarjeta Flotante PII Preview */}
          </main>

          {/* Frontera HU-FRONT-04: Widget flotante + Drawer expandible del Copiloto */}
          <CopilotChatWidget />
          <CopilotChatDrawer />

          {/* Frontera HU-FRONT-06: Drawer de linaje "Explícame esta cifra" */}
          <ExplainNumberDrawer />
        </div>
      </CopilotChatProvider>
    </ExplainNumberProvider>
  );
}
