'use client';

import React from 'react';
import { PipelineCanvas } from '@/components/canvas/PipelineCanvas';
import { Shield } from 'lucide-react';
import { CopilotChatDrawer, CopilotChatPanel, CopilotChatProvider, CopilotChatWidget } from '@/components/copilot';

export default function MidasConsolePage() {
  return (
    <CopilotChatProvider>
      <div className="flex h-screen w-screen flex-col bg-[#0B0F17]">
      {/* 1. Header Ejecutivo Corporativo */}
      <header className="flex h-14 w-full items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-6 backdrop-blur-md">
        {/* Marca y Subtítulo */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 shadow-lg shadow-amber-500/20">
            <span className="text-sm font-black text-slate-950">M</span>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-100 flex items-center gap-2">
              MIDAS
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-amber-400 border border-amber-500/20">
                ACTIVE LAKEHOUSE
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">Enterprise Observability & Real-Time Dataflow Canvas</p>
          </div>
        </div>

        {/* Frontera HU-FRONT-03: Placeholder Barra Replay */}
        <div className="hidden lg:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Time-Travel Replay:</span>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono text-emerald-400 font-bold">
              ● LIVE
            </span>
            <span className="text-slate-600 text-xs">|</span>
            <span className="text-[10px] text-slate-500 hover:text-slate-300 cursor-not-allowed" title="Preparado para HU-FRONT-03">
              T0 Normal
            </span>
            <span className="text-[10px] text-slate-500 hover:text-slate-300 cursor-not-allowed" title="Preparado para HU-FRONT-03">
              T1 Incidente
            </span>
            <span className="text-[10px] text-slate-500 hover:text-slate-300 cursor-not-allowed" title="Preparado para HU-FRONT-03">
              T2 Guardian
            </span>
            <span className="text-[10px] text-slate-500 hover:text-slate-300 cursor-not-allowed" title="Preparado para HU-FRONT-03">
              T3 Publicado
            </span>
          </div>
        </div>

        {/* Frontera HU-FRONT-05: Selector Zero-Trust Roles */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300">
            <Shield className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[11px] font-medium">Director General</span>
            <span className="rounded bg-blue-950 border border-blue-500/30 px-1 py-0.2 text-[9px] font-mono text-blue-400">
              Admin
            </span>
          </div>
        </div>
      </header>

      {/* 2. Cuerpo Principal Dividido (Split Console) */}
      <main className="flex flex-1 overflow-hidden">
        {/* Panel Izquierdo: Canvas Topológico React Flow (65% width) */}
        <section
          aria-label="Topología del Pipeline Lakehouse"
          className="relative flex-1 h-full border-r border-slate-800/80"
        >
          <PipelineCanvas />
        </section>

        {/* Panel Derecho: Copiloto Agéntico (35% width - HU-FRONT-04 / HU-AI-01) */}
        <section
          aria-label="Copiloto Agéntico y Data Storytelling"
          className="hidden xl:flex w-[420px] flex-col bg-slate-950/80 border-l border-slate-800/60 p-4"
        >
          <CopilotChatPanel />
        </section>
      </main>

      {/* Frontera HU-FRONT-04: Widget flotante + Drawer expandible del Copiloto */}
      <CopilotChatWidget />
      <CopilotChatDrawer />
      </div>
    </CopilotChatProvider>
  );
}
