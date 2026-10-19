'use client';

import dynamic from 'next/dynamic';
import { Shield } from 'lucide-react';
import { CopilotChatDrawer, CopilotChatPanel, CopilotChatProvider, CopilotChatWidget } from '@/components/copilot';

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
  return (
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
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded text-[#4D7C0F] bg-[#4D7C0F]/10 border border-[#4D7C0F]/25 font-medium">
              v2.4 Prod
            </span>
          </div>
        </div>

        {/* Frontera HU-FRONT-03: Barra Time-Travel Replay */}
        <nav className="hidden lg:flex items-center bg-[#F7F7F5] border border-[#F0EDE7] rounded-md p-0.5 text-xs shadow-inner">
          <span className="text-[10px] uppercase tracking-wider text-[#787164] font-mono px-2 py-1 font-medium">Replay:</span>
          <div className="flex items-center space-x-0.5">
            <button
              type="button"
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#FFFFFF] text-[#1C1E21] font-medium border border-[#D4AF37] shadow-xs transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C0F]" />
              <span className="font-mono text-[11px] font-semibold text-[#8C6D1F]">LIVE</span>
            </button>
            <button
              type="button"
              disabled
              className="px-2 py-1 rounded text-[#6B6557] hover:text-[#1C1E21] hover:bg-[#FAFAFA] transition-colors font-mono text-[11px] cursor-not-allowed"
              title="Preparado para HU-FRONT-03: Time-Travel Replay"
            >
              T0 Normal
            </button>
            <button
              type="button"
              disabled
              className="px-2 py-1 rounded text-[#6B6557] hover:text-[#1C1E21] hover:bg-[#FAFAFA] transition-colors font-mono text-[11px] cursor-not-allowed"
              title="Preparado para HU-FRONT-03: Incidente Inyectado"
            >
              T1 Incidente
            </button>
            <button
              type="button"
              disabled
              className="px-2 py-1 rounded text-[#6B6557] hover:text-[#1C1E21] hover:bg-[#FAFAFA] transition-colors font-mono text-[11px] cursor-not-allowed"
              title="Preparado para HU-FRONT-03: Guardian Auto-Healing"
            >
              T2 Guardian
            </button>
            <button
              type="button"
              disabled
              className="px-2 py-1 rounded text-[#6B6557] hover:text-[#1C1E21] hover:bg-[#FAFAFA] transition-colors font-mono text-[11px] cursor-not-allowed"
              title="Preparado para HU-FRONT-03: Snapshot Publicado"
            >
              T3 Publicado
            </button>
          </div>
        </nav>

        {/* Frontera HU-FRONT-05: Selector Zero-Trust Roles */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs text-[#787164] font-mono border-r border-[#E8E4DC] pr-3">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#4D7C0F]" />
            <span>eu-west-1</span>
          </div>
          <div className="flex items-center space-x-2 bg-[#FAFAFA] border border-[#E8E4DC] px-2.5 py-1 rounded-md shadow-xs">
            <div className="w-4 h-4 rounded bg-[#FBF8EF] flex items-center justify-center text-[#996515] text-[10px] font-bold font-serif">
              D
            </div>
            <span className="text-xs text-[#1C1E21] font-medium tracking-tight">Director General</span>
            <span className="text-[9px] uppercase font-mono px-1 rounded bg-[#F0EDE7] text-[#787164] font-semibold">Admin</span>
          </div>
        </div>
      </header>

      {/* 2. Cuerpo Principal Dividido (Split Console) */}
      <main className="flex flex-1 overflow-hidden">
        {/* Panel Izquierdo: Canvas Topológico React Flow (65% width) */}
        <section
          aria-label="Topología del Pipeline Lakehouse"
          className="relative flex-1 h-full border-r border-[#E8E4DC] bg-[#FFFFFF]"
        >
          <PipelineCanvas />
        </section>

        {/* Panel Derecho: Copiloto Agéntico (35% width - HU-FRONT-04 / HU-AI-01) */}
        <section
          aria-label="Copiloto Agéntico y Data Storytelling"
          className="hidden xl:flex w-96 flex-col justify-between shrink-0 z-30 border-l border-[#E8E4DC] bg-[#FFFFFF] shadow-[-1px_0_4px_rgba(40,30,10,0.02)]"
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
