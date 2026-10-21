'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { CopilotChatDrawer, CopilotChatProvider, CopilotChatWidget } from '@/components/copilot';
import { ExplainNumberDrawer, ExplainNumberProvider } from '@/components/lineage';
import { ZeroTrustLens, type ZeroTrustRole } from '@/components/security/ZeroTrustLens';

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
  const [selectedRole, setSelectedRole] = useState<ZeroTrustRole>('admin');

  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  useEffect(() => {
    void fetch(`${api}/api/v1/auth/me`, { credentials: 'include' })
      .then((response) => setAuthenticated(response.ok)).catch(() => setAuthenticated(false));
  }, [api]);

  if (!authenticated) {
    return <main className="flex h-screen items-center justify-center bg-[#FAFAFA] text-[#1C1E21]">
      <form className="w-96 space-y-4 rounded-xl border bg-white p-8" onSubmit={async (event) => {
        event.preventDefault();
        try {
          const response = await fetch(`${api}/api/v1/auth/login`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          if (!response.ok) throw new Error('Access denied');
          setToken('');
          setAuthenticated(true);
        } catch { setLoginError('Could not sign in. Check the operator token and API connection.'); }
      }}>
        <h1 className="font-serif text-2xl">Midas</h1>
        <label className="block">Operator access token
          <input type="password" autoComplete="off" required value={token}
            onChange={(event) => setToken(event.target.value)} className="mt-2 w-full rounded border p-2" />
        </label>
        <button className="rounded bg-[#1C1E21] px-4 py-2 text-white" type="submit">Sign in</button>
        {loginError && <p role="alert">{loginError}</p>}
      </form>
    </main>;
  }

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
              <div className="flex items-center gap-2.5">
                <span className="font-serif font-semibold text-xs tracking-wider text-[#1C1E21]">MIDAS</span>
                <span className="text-[10px] font-mono text-[#787164] tracking-tight border-l border-[#E8E4DC] pl-2.5">
                  Active Lakehouse
                </span>
              </div>
            </div>

            {/* Frontera HU-FRONT-03: Time-Travel Replay Status */}
            <div className="hidden lg:flex items-center bg-[#F7F7F5] border border-[#F0EDE7] rounded-md px-2.5 py-1 text-xs shadow-inner gap-2">
              <span className="text-[10px] uppercase tracking-wider text-[#787164] font-mono font-medium">Time-Travel Replay:</span>
              <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#FFFFFF] text-[#1C1E21] font-medium border border-[#D4AF37]/40 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C0F] animate-pulse" />
                <span className="font-mono text-[10px] font-semibold text-[#8C6D1F]">Pipeline event history</span>
              </span>
            </div>

            {/* Frontera HU-FRONT-05: Selector Zero-Trust Roles */}
            <span className="text-xs">Director account · Ranger policies pending</span>
          </header>

          {/* 2. Cuerpo Principal: Canvas Topológico React Flow (Full-Width) */}
          <main className="relative flex flex-1 overflow-hidden">
            <section
              aria-label="Topología del Pipeline Lakehouse"
              className="relative flex-1 h-full bg-[#FFFFFF]"
            >
              <PipelineCanvas securityRole={selectedRole} />
            </section>

            {/* Frontera HU-FRONT-05: Overlay Tarjeta Flotante PII Preview */}
            <div className="pointer-events-auto absolute bottom-20 left-4 z-20">
              <ZeroTrustLens role={selectedRole} preview />
            </div>
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
