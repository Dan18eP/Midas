'use client';

/**
 * Midas - Pantalla de Bienvenida y Menú «+» de Ingesta (Welcome Hub).
 *
 * Historia de Usuario: HU-FRONT-07 / ADR-010
 * Autor: Dilan Chávez (@dilandcv)
 * Experiencia de entrada estilo ChatGPT con botón «+» de fuentes (Excel, CSV, REST, DB),
 * prompt bar central con sugerencias ejecutivas y saludo dinámico Zero-Trust.
 * Estrictamente sin emojis (solo SVG / Lucide).
 */

import React, { useState } from 'react';
import {
  FileSpreadsheet,
  ArrowUp,
  Sparkles,
  Zap,
  Shield,
  BarChart3,
} from 'lucide-react';
import { type ZeroTrustRole } from '@/components/security/ZeroTrustLens';
import { QuickConnectionModal, type QuickSourceType } from './QuickConnectionModal';
import { SourceActionMenu } from '@/components/copilot/SourceActionMenu';
import { ChatParticleBackground } from '@/components/copilot/ChatParticleBackground';

interface WelcomeHeroProps {
  securityRole?: ZeroTrustRole;
  hasConnectedData?: boolean;
  connectedSourceName?: string;
  onSendPrompt: (prompt: string) => void;
  onQuickConnectSuccess?: (sourceName: string) => void;
}

export function WelcomeHero({
  securityRole = 'admin',
  hasConnectedData = false,
  connectedSourceName,
  onSendPrompt,
  onQuickConnectSuccess,
}: WelcomeHeroProps) {
  const [prompt, setPrompt] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedQuickType, setSelectedQuickType] = useState<QuickSourceType>('excel');

  const handleOpenLauncher = (type: QuickSourceType) => {
    setSelectedQuickType(type);
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = prompt.trim();
    if (!clean) return;
    onSendPrompt(clean);
  };

  const handleSuggestionClick = (suggestion: string) => {
    onSendPrompt(suggestion);
  };

  const suggestions = hasConnectedData
    ? [
        {
          label: 'Resumir registros y estructura de datos',
          prompt: 'Resumir registros, esquema y estructura del conjunto de datos conectado',
          icon: FileSpreadsheet,
        },
        {
          label: 'Consultar métricas de calidad y cuarentena',
          prompt: 'Consultar métricas de calidad del dataset y registros en cuarentena Guardian',
          icon: Shield,
        },
        {
          label: 'Generar propuesta de capa Gold y gráficos',
          prompt: 'Generar propuesta de capa Gold optimizada y gráficos analíticos interactivos',
          icon: Sparkles,
        },
      ]
    : [
        {
          label: '¿Cómo procesa Midas de Bronze a Silver?',
          prompt: '¿Cómo procesa Midas los datos de Bronze a Silver y qué transformaciones realiza?',
          icon: Zap,
        },
        {
          label: '¿Cómo funciona el Quality Gate y cuarentena?',
          prompt: '¿Cómo funciona el Quality Gate y la cuarentena Guardian en la arquitectura Midas?',
          icon: Shield,
        },
        {
          label: '¿Cómo solicito un Data Mart Gold con IA?',
          prompt: '¿Cómo solicito un Data Mart Gold personalizado con IA y cómo se materializa en Trino?',
          icon: BarChart3,
        },
      ];

  return (
    <div className="relative flex min-h-full w-full flex-col items-center justify-center px-4 py-8 bg-[#FBF8EF]/30 text-[#1C1E21] antialiased overflow-hidden">
      {/* Background Subtle Gradient & Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#D4AF37_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

      {/* Fondo Animado Aether Flow Midas (Partículas doradas en canvas transparente) */}
      <ChatParticleBackground maxParticles={85} connectionDistance={155} mouseRadius={135} />

      <div className="relative z-10 w-full max-w-3xl flex flex-col items-center text-center space-y-6">
        {/* Dynamic Professional Greeting */}
        <div className="space-y-2">
          <h1 className="font-chatgpt text-2xl md:text-3xl lg:text-[32px] font-semibold tracking-tight text-[#1C1E21] leading-tight">
            ¿Qué deseas analizar o construir hoy?
          </h1>
          <p className="text-xs text-[#787164] mt-1 font-sans">
            Midas Active Lakehouse &amp; Inteligencia Conversacional · Flujo Medallón asistido por IA
          </p>
        </div>

        {/* Central Prompt Input Bar (ChatGPT-Style) con Menú «+» */}
        <form
          onSubmit={handleSubmit}
          className="relative w-full rounded-2xl border border-[#E8E4DC] bg-[#FFFFFF] p-2 shadow-[0_4px_24px_rgba(40,30,10,0.06)] hover:border-[#D4AF37]/60 transition-all focus-within:border-[#D4AF37] focus-within:ring-2 focus-within:ring-[#D4AF37]/20"
        >
          <div className="flex items-center gap-2.5 px-2">
            {/* Menú «+» de fuentes de datos */}
            <SourceActionMenu onSelect={handleOpenLauncher} />

            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="¿Qué analizamos hoy? Ej: Consultar métricas de cobranza o inspeccionar linaje..."
              className="w-full bg-transparent text-sm text-[#1C1E21] placeholder-[#A0988A] focus:outline-none py-2.5 font-sans"
            />
            <button
              type="submit"
              disabled={!prompt.trim()}
              aria-label="Enviar prompt"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37] text-white hover:bg-[#B8860B] active:scale-95 disabled:opacity-40 disabled:hover:bg-[#D4AF37] transition-all shadow-xs"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Prompt Suggestions (Opción C Adaptativa) */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {suggestions.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSuggestionClick(item.prompt)}
                className="flex items-center gap-1.5 rounded-full border border-[#E8E4DC] bg-[#FFFFFF] px-3.5 py-1.5 text-xs text-[#4B4639] hover:bg-[#FBF8EF] hover:border-[#D4AF37]/60 transition-colors shadow-2xs cursor-pointer"
              >
                <Icon className="h-3.5 w-3.5 text-[#B8860B]" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Connection Modal */}
      <QuickConnectionModal
        isOpen={modalOpen}
        initialType={selectedQuickType}
        onClose={() => setModalOpen(false)}
        onSuccess={onQuickConnectSuccess}
      />
    </div>
  );
}
