'use client';

import { useEffect } from 'react';
import { Bot, Maximize2, Minimize2, RotateCcw, Wifi, X } from 'lucide-react';
import { ChatConversation } from './ChatConversation';
import { useCopilotChatContext } from './CopilotChatContext';

export function CopilotChatDrawer() {
  const {
    drawerOpen,
    expanded,
    toggleDrawer,
    closeDrawer,
    toggleExpanded,
    startNewChat,
    status,
    inferenceMode,
    setInferenceMode,
  } = useCopilotChatContext();

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, closeDrawer]);

  return (
    <div
      className={`fixed inset-0 z-[60] ${drawerOpen ? '' : 'pointer-events-none'}`}
      aria-hidden={!drawerOpen}
      data-testid="copilot-drawer-root"
    >
      <div
        onClick={closeDrawer}
        className={`absolute inset-0 bg-[#1C1E21]/20 backdrop-blur-xs transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Copiloto Agéntico de Midas"
        data-testid="copilot-drawer"
        data-expanded={expanded ? 'true' : 'false'}
        className={`absolute right-0 top-0 flex h-full flex-col border-l border-[#E8E4DC] bg-[#FFFFFF] shadow-[-10px_0_40px_rgba(30,20,10,0.06)] transition-all duration-300 ${
          expanded ? 'w-full sm:w-[780px] lg:w-[920px]' : 'w-full sm:w-[460px] lg:w-[520px]'
        } ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[#F0EDE7] bg-[#FAFAFA] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FBF8EF] border border-[#D4AF37] text-[#B8860B] shadow-2xs">
              <Bot className="h-4 w-4 text-[#B8860B]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xs font-serif font-bold text-[#1C1E21]">Copiloto Agéntico</h2>
              <span className="text-[10px] text-[#787164] font-mono">LangGraph · Storytelling · ECharts</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] sm:inline-flex ${
                status === 'error'
                  ? 'border-[#ECCFC5] bg-[#FFF8F5] text-[#A8422B]'
                  : 'border-[#4D7C0F]/25 bg-[#4D7C0F]/10 text-[#4D7C0F]'
              }`}
            >
              <Wifi className="h-2.5 w-2.5" />
              {status === 'error' ? 'Sin conexión' : 'En Línea'}
            </span>
            <button
              type="button"
              onClick={startNewChat}
              title="Nueva conversación"
              aria-label="Nueva conversación"
              data-testid="copilot-new-chat"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#F0EDE7] bg-[#FFFFFF] text-[#787164] hover:text-[#1C1E21] hover:bg-[#F7F7F5] transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={toggleExpanded}
              title={expanded ? 'Contraer panel' : 'Expandir panel'}
              aria-label={expanded ? 'Contraer panel' : 'Expandir panel'}
              data-testid="copilot-toggle-expand"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#F0EDE7] bg-[#FFFFFF] text-[#787164] hover:text-[#1C1E21] hover:bg-[#F7F7F5] transition"
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={closeDrawer}
              title="Cerrar"
              aria-label="Cerrar Copiloto"
              data-testid="copilot-close-drawer"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#F0EDE7] bg-[#FFFFFF] text-[#787164] hover:text-[#A8422B] hover:bg-[#FFF8F5] transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Selector de Modo de Inferencia: Confidencial Local (Qwen 2.5: 3B) vs Nube (Gemini) */}
        <div className="flex items-center justify-between border-b border-[#F0EDE7] bg-[#FDFCFB] px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[#787164]">Inferencia:</span>
            <div className="inline-flex rounded-md border border-[#E8E4DC] bg-white p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setInferenceMode('cloud')}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                  inferenceMode === 'cloud'
                    ? 'bg-[#B8860B] text-white shadow-2xs'
                    : 'text-[#787164] hover:text-[#1C1E21]'
                }`}
                title="Modo Nube rápido con Gemini API Key"
              >
                ⚡ Cloud (Gemini)
              </button>
              <button
                type="button"
                onClick={() => setInferenceMode('local')}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                  inferenceMode === 'local'
                    ? 'bg-[#4D7C0F] text-white shadow-2xs'
                    : 'text-[#787164] hover:text-[#1C1E21]'
                }`}
                title="Modo 100% Confidencial en máquina local sin enviar datos a internet"
              >
                🔒 Zero-Trust Local (Qwen 2.5: 3B)
              </button>
            </div>
          </div>
          <span className="text-[9px] font-mono text-[#8C6D1F]">
            {inferenceMode === 'local' ? '100% Soberano (Ollama)' : 'Procesamiento Gemini'}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-2">
          <ChatConversation autoFocus={drawerOpen} />
        </div>
      </aside>
    </div>
  );
}
