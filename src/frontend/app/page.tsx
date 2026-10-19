'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Shield, Sparkles, Cpu } from 'lucide-react';

const PipelineCanvas = dynamic(
  () => import('@/components/canvas/PipelineCanvas').then((mod) => mod.PipelineCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#FBF9F5] text-[#4B4639] font-mono text-xs">
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
    <div className="flex h-screen w-screen flex-col bg-[#FBF9F5] text-[#1C1E21] antialiased">
      {/* 1. Header Ejecutivo Corporativo — Geometría Clásica & Precisión Técnica */}
      <header className="flex h-13 w-full items-center justify-between border-b border-[#E8E0D0] bg-[#FFFFFF] px-4 py-2.5 shadow-[0_1px_3px_rgba(40,30,10,0.03)] z-40 relative">
        {/* Marca y Subtítulo */}
        <div className="flex items-center space-x-3.5">
          <div className="w-7 h-7 rounded-md bg-[#FAF6EC] border border-[#D4AF37]/80 flex items-center justify-center text-[#B8860B] shadow-sm">
            <span className="font-serif font-bold text-xs tracking-wider">M</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-serif font-semibold text-xs tracking-wider text-[#1C1E21]">MIDAS</span>
            <span className="text-[10px] font-mono text-[#787164] tracking-tight border-l border-[#E8E0D0] pl-2.5">
              Active Lakehouse
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded text-[#4D7C0F] bg-[#4D7C0F]/10 border border-[#4D7C0F]/25 font-medium">
              v2.4 Prod
            </span>
          </div>
        </div>

        {/* Frontera HU-FRONT-03: Barra Time-Travel Replay */}
        <nav className="hidden lg:flex items-center bg-[#F8F6F0] border border-[#E5DCB8] rounded-md p-0.5 text-xs shadow-inner">
          <span className="text-[10px] uppercase tracking-wider text-[#787164] font-mono px-2 py-1 font-medium">Replay:</span>
          <div className="flex items-center space-x-0.5">
            <button
              type="button"
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#FFFFFF] text-[#1C1E21] font-medium border border-[#D4AF37]/60 shadow-xs transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C0F]" />
              <span className="font-mono text-[11px] font-semibold text-[#8C6D1F]">LIVE</span>
            </button>
            <button
              type="button"
              disabled
              className="px-2 py-1 rounded text-[#6B6557] hover:text-[#1C1E21] hover:bg-[#FFFFFF] transition-colors font-mono text-[11px] cursor-not-allowed"
              title="Preparado para HU-FRONT-03: Time-Travel Replay"
            >
              T0 Normal
            </button>
            <button
              type="button"
              disabled
              className="px-2 py-1 rounded text-[#6B6557] hover:text-[#1C1E21] hover:bg-[#FFFFFF] transition-colors font-mono text-[11px] cursor-not-allowed"
              title="Preparado para HU-FRONT-03: Incidente Inyectado"
            >
              T1 Incidente
            </button>
            <button
              type="button"
              disabled
              className="px-2 py-1 rounded text-[#6B6557] hover:text-[#1C1E21] hover:bg-[#FFFFFF] transition-colors font-mono text-[11px] cursor-not-allowed"
              title="Preparado para HU-FRONT-03: Guardian Auto-Healing"
            >
              T2 Guardian
            </button>
            <button
              type="button"
              disabled
              className="px-2 py-1 rounded text-[#6B6557] hover:text-[#1C1E21] hover:bg-[#FFFFFF] transition-colors font-mono text-[11px] cursor-not-allowed"
              title="Preparado para HU-FRONT-03: Snapshot Publicado"
            >
              T3 Publicado
            </button>
          </div>
        </nav>

        {/* Frontera HU-FRONT-05: Selector Zero-Trust Roles */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs text-[#787164] font-mono border-r border-[#E8E0D0] pr-3">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#4D7C0F]" />
            <span>eu-west-1</span>
          </div>
          <div className="flex items-center space-x-2 bg-[#FAF8F5] border border-[#E8E0D0] px-2.5 py-1 rounded-md shadow-xs">
            <div className="w-4 h-4 rounded bg-[#F4EEDC] flex items-center justify-center text-[#996515] text-[10px] font-bold font-serif">
              D
            </div>
            <span className="text-xs text-[#1C1E21] font-medium tracking-tight">Director General</span>
            <span className="text-[9px] uppercase font-mono px-1 rounded bg-[#EFECE3] text-[#787164] font-semibold">Admin</span>
          </div>
        </div>
      </header>

      {/* 2. Cuerpo Principal Dividido (Split Console) */}
      <main className="flex flex-1 overflow-hidden">
        {/* Panel Izquierdo: Canvas Topológico React Flow (65% width) */}
        <section
          aria-label="Topología del Pipeline Lakehouse"
          className="relative flex-1 h-full border-r border-[#E8E0D0] bg-[#FBF9F5]"
        >
          <PipelineCanvas />
        </section>

        {/* Panel Derecho: Copiloto Agéntico (35% width) */}
        <aside
          aria-label="Copiloto Agéntico y Data Storytelling"
          className="hidden xl:flex w-96 flex-col justify-between shrink-0 z-30 border-l border-[#E8E0D0] bg-[#FFFFFF] shadow-[-1px_0_4px_rgba(40,30,10,0.02)]"
        >
          {/* Header Copiloto */}
          <div className="p-3 border-b border-[#E8E0D0] bg-[#FAF8F5] flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-6 h-6 rounded bg-[#FCF8EC] border border-[#D4AF37] flex items-center justify-center text-[#B8860B] shadow-xs">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-xs font-serif font-bold text-[#1C1E21] tracking-tight">Copiloto Agéntico</h2>
                <span className="text-[10px] text-[#787164] font-mono">LangGraph · Data Storytelling</span>
              </div>
            </div>
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#FFFFFF] border border-[#E5DCB8] shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C0F]" />
              <span className="text-[10px] font-mono text-[#4D7C0F] font-semibold">En Línea</span>
            </div>
          </div>

          {/* Área de Conversación Mock / Frontera */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 bg-[#FFFFFF]">
            {/* Mensaje Proactivo de Bienvenida */}
            <article className="bg-[#FDFBF7] border border-[#E8DFC8] rounded-lg p-3 text-xs space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#EFECE3]">
                <div className="flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B]" />
                  <span className="font-serif font-semibold text-[#1C1E21] text-[11px]">Briefing Matutino Proactivo</span>
                </div>
                <span className="text-[10px] font-mono text-[#787164]">08:30 UTC</span>
              </div>
              <p className="text-xs leading-relaxed text-[#4B4639]">
                Detectadas 3 fuentes de datos sincronizadas en MinIO Bronze. Se completó el lote de 6,690 registros. Silver identificó 14 transacciones con anomalías F3 desviadas a cuarentena por Midas Guardian.
              </p>
              <div className="pt-2 border-t border-[#EFECE3] flex items-center justify-between text-[10px] font-mono">
                <span className="text-[#4D7C0F] font-semibold flex items-center space-x-1">
                  <span>✓</span>
                  <span>100% Contratos</span>
                </span>
                <span className="text-[#787164] bg-[#FAF8F5] px-1.5 py-0.5 rounded border border-[#EAE4D9] font-medium">
                  Iceberg v2
                </span>
              </div>
            </article>

            {/* Turno Conversacional: Usuario */}
            <div className="flex flex-col space-y-1">
              <div className="flex items-center justify-between text-[10px] text-[#787164] font-mono px-1">
                <span className="font-semibold text-[#1C1E21]">Director General</span>
                <span>08:32</span>
              </div>
              <div className="bg-[#F4F1EA] border border-[#DFD5C0] rounded-lg p-2.5 text-xs text-[#1C1E21]">
                ¿Cuál es la causa raíz de las 14 transacciones en cuarentena y el impacto en fact_ventas?
              </div>
            </div>

            {/* Turno Conversacional: Agente */}
            <div className="flex flex-col space-y-1">
              <div className="flex items-center space-x-1.5 text-[10px] text-[#8C6D1F] font-mono px-1">
                <span className="font-serif font-bold">Midas Agent</span>
                <span className="text-[#787164]">· Playbook PB-03</span>
              </div>
              <div className="bg-[#FFFFFF] border border-[#E5DCB8] rounded-lg p-3 text-xs text-[#2C3036] space-y-2 shadow-xs">
                <p className="text-[#1C1E21]">
                  Análisis completado en <span className="font-mono font-semibold text-[#8C6D1F]">0.42s</span>:
                </p>
                <ul className="space-y-1.5 font-mono text-[11px] text-[#4B4639]">
                  <li className="flex items-start space-x-1.5">
                    <span className="text-[#A8422B] font-bold">▪</span>
                    <span>Fallo de integridad F3: Formato de divisa ISO no tipado en 14 pedidos de la API REST.</span>
                  </li>
                  <li className="flex items-start space-x-1.5">
                    <span className="text-[#4D7C0F] font-bold">▪</span>
                    <span>Impacto en Gold: 0%. Las métricas financieras se publicaron limpias bajo patrón WAP.</span>
                  </li>
                </ul>
                <div className="pt-2 border-t border-[#F2ECE1] flex gap-1.5">
                  <button type="button" className="px-2 py-1 bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[#1C1E21] text-[10px] font-mono font-medium rounded border border-[#DFD5C0] transition-colors shadow-2xs">
                    Ver Cuarentena (14)
                  </button>
                  <button type="button" className="px-2 py-1 bg-[#FCFAF4] hover:bg-[#F9F4E4] text-[#8C6D1F] text-[10px] font-mono font-semibold rounded border border-[#D4AF37] transition-colors shadow-2xs">
                    Aplicar Auto-Fix
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Input Prompt Footer */}
          <div className="p-3 border-t border-[#E8E0D0] bg-[#FAF8F5]">
            <div className="relative flex items-center">
              <input
                type="text"
                disabled
                placeholder="Pregunta a Midas o escribe 'Crea vista Gold...'"
                className="w-full bg-[#FFFFFF] border border-[#DFD5C0] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/50 text-xs text-[#1C1E21] placeholder-[#8A8374] rounded pl-3 pr-8 py-2 font-sans transition-colors shadow-xs"
              />
              <button
                type="button"
                disabled
                className="absolute right-2 text-[#B8860B] hover:text-[#8C6D1F] transition-colors"
                title="Enviar consulta"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
