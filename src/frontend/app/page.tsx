'use client';

import React from 'react';
import { PipelineCanvas } from '@/components/canvas/PipelineCanvas';
import { Shield, Sparkles, Database, Terminal, Cpu } from 'lucide-react';

export default function MidasConsolePage() {
  return (
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

        {/* Panel Derecho: Copiloto Agéntico (35% width - Placeholder HU-FRONT-04 / HU-AI-01) */}
        <section
          aria-label="Copiloto Agéntico y Data Storytelling"
          className="hidden xl:flex w-[420px] flex-col bg-slate-950/80 border-l border-slate-800/60 p-4"
        >
          {/* Header Copiloto */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-950 text-indigo-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-slate-100">Copiloto Agéntico</h2>
                <span className="text-[10px] text-slate-400">LangGraph · Data Storytelling</span>
              </div>
            </div>
            <span className="rounded-full bg-emerald-950/60 border border-emerald-600/40 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
              En Línea
            </span>
          </div>

          {/* Área de Conversación Mock / Frontera */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1 text-xs">
            {/* Mensaje Proactivo de Bienvenida */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-indigo-400 font-semibold text-[11px]">
                <Cpu className="h-3.5 w-3.5" />
                <span>Briefing Matutino Proactivo:</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                "Detectadas 3 fuentes de datos sincronizadas en MinIO Bronze. Se completó el lote de 6,690 registros. Silver identificó 14 transacciones con anomalías F3 desviadas a cuarentena por Midas Guardian."
              </p>
              <div className="rounded bg-slate-950/80 p-2 font-mono text-[10px] text-slate-400 border border-slate-800/80 flex items-center justify-between">
                <span>✓ Sello Calidad: 100% Contratos</span>
                <span className="text-emerald-400 font-bold">Iceberg v2</span>
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-4 text-center">
              <p className="text-[11px] text-slate-500">
                Superficie reservada para el chat interactivo de Joshua Gonzales (<code className="text-indigo-400">HU-FRONT-04</code>) y el motor conversacional de Elian Rivera (<code className="text-indigo-400">HU-AI-01</code>).
              </p>
            </div>
          </div>

          {/* Input Prompt Footer */}
          <div className="pt-3 border-t border-slate-800">
            <div className="relative">
              <input
                type="text"
                disabled
                placeholder="Pregunta a Midas o escribe 'Crea vista Gold...' (HU-FRONT-04)"
                className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 py-2.5 text-xs text-slate-400 placeholder-slate-600 cursor-not-allowed focus:outline-none"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
