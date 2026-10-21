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
  Database,
  ArrowUp,
  Sparkles,
  Shield,
} from 'lucide-react';
import { PROFILES, type ZeroTrustRole } from '@/components/security/ZeroTrustLens';
import { QuickConnectionModal, type QuickSourceType } from './QuickConnectionModal';
import { SourceActionMenu } from '@/components/copilot/SourceActionMenu';

interface WelcomeHeroProps {
  securityRole?: ZeroTrustRole;
  onSendPrompt: (prompt: string) => void;
  onQuickConnectSuccess?: (sourceName: string) => void;
}

export function WelcomeHero({
  securityRole = 'admin',
  onSendPrompt,
  onQuickConnectSuccess,
}: WelcomeHeroProps) {
  const [prompt, setPrompt] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedQuickType, setSelectedQuickType] = useState<QuickSourceType>('excel');

  const profile = PROFILES[securityRole] || PROFILES.admin;
  const userName = profile.label || 'Usuario Midas';

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

  return (
    <div className="relative flex min-h-full w-full flex-col items-center justify-center px-4 py-8 bg-[#FBF8EF]/30 text-[#1C1E21] antialiased">
      {/* Background Subtle Gradient & Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#D4AF37_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

      <div className="relative z-10 w-full max-w-3xl flex flex-col items-center text-center space-y-6">
        {/* Zero-Trust Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/40 bg-[#FFFFFF] px-3 py-1 shadow-xs">
          <Shield className="h-3.5 w-3.5 text-[#B8860B]" />
          <span className="font-mono text-xs font-semibold text-[#8C6D1F]">
            Zero-Trust Lens: {profile.short} ({profile.visibility})
          </span>
        </div>

        {/* Dynamic Executive Greeting (ADR-010) */}
        <div className="space-y-2">
          <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight text-[#1C1E21]">
            Hola, {userName}. ¿Qué tienes en mente hoy?
          </h1>
          <p className="max-w-xl mx-auto text-sm text-[#787164]">
            Midas introspecciona tus fuentes conectadas, analiza linaje en Bronze/Silver/Gold y genera
            pipelines verificados con IA para decisiones ejecutivas confiables.
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

        {/* Prompt Suggestions */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => handleSuggestionClick('Explorar tablas de CRM')}
            className="flex items-center gap-1.5 rounded-full border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#4B4639] hover:bg-[#FBF8EF] hover:border-[#D4AF37]/60 transition-colors shadow-2xs"
          >
            <Database className="h-3 w-3 text-[#B8860B]" />
            <span>Explorar tablas de CRM</span>
          </button>
          <button
            type="button"
            onClick={() => handleSuggestionClick('Analizar cumplimiento de presupuesto')}
            className="flex items-center gap-1.5 rounded-full border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#4B4639] hover:bg-[#FBF8EF] hover:border-[#D4AF37]/60 transition-colors shadow-2xs"
          >
            <FileSpreadsheet className="h-3 w-3 text-[#B8860B]" />
            <span>Analizar cumplimiento de presupuesto</span>
          </button>
          <button
            type="button"
            onClick={() => handleSuggestionClick('Crear nuevo Mart Gold')}
            className="flex items-center gap-1.5 rounded-full border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#4B4639] hover:bg-[#FBF8EF] hover:border-[#D4AF37]/60 transition-colors shadow-2xs"
          >
            <Sparkles className="h-3 w-3 text-[#B8860B]" />
            <span>Crear nuevo Mart Gold</span>
          </button>
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
