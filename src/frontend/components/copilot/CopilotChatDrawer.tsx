'use client';

import { useEffect } from 'react';
import { Bot, Maximize2, Minimize2, RotateCcw, Wifi, X } from 'lucide-react';
import { ChatConversation } from './ChatConversation';
import { useCopilotChatContext } from './CopilotChatContext';

export function CopilotChatDrawer() {
  const { drawerOpen, expanded, toggleDrawer, closeDrawer, toggleExpanded, startNewChat, status } =
    useCopilotChatContext();

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
        className={`absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Copiloto Agéntico de Midas"
        data-testid="copilot-drawer"
        data-expanded={expanded ? 'true' : 'false'}
        className={`absolute right-0 top-0 flex h-full flex-col border-l border-slate-800 bg-[#0B0F17] shadow-[0_0_60px_rgba(2,6,23,0.9)] transition-all duration-300 ${
          expanded ? 'w-full sm:w-[780px] lg:w-[920px]' : 'w-full sm:w-[460px] lg:w-[520px]'
        } ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/90 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-amber-500">
              <Bot className="h-4 w-4 text-white" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xs font-bold text-slate-100">Copiloto Agéntico</h2>
              <span className="text-[10px] text-slate-400">LangGraph · Storytelling · ECharts</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] sm:inline-flex ${
                status === 'error'
                  ? 'border-rose-700/50 bg-rose-950/60 text-rose-400'
                  : 'border-emerald-700/40 bg-emerald-950/60 text-emerald-400'
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
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/70 text-slate-400 transition hover:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={toggleExpanded}
              title={expanded ? 'Contraer panel' : 'Expandir panel'}
              aria-label={expanded ? 'Contraer panel' : 'Expandir panel'}
              data-testid="copilot-toggle-expand"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/70 text-slate-400 transition hover:text-slate-200"
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={closeDrawer}
              title="Cerrar"
              aria-label="Cerrar Copiloto"
              data-testid="copilot-close-drawer"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/70 text-slate-400 transition hover:text-rose-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-2">
          <ChatConversation autoFocus={drawerOpen} />
        </div>
      </aside>
    </div>
  );
}
