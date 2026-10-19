'use client';

import { Bot } from 'lucide-react';
import { useCopilotChatContext } from './CopilotChatContext';

const STATUS_HINT: Record<string, string> = {
  idle: 'Abrir Copiloto Agéntico',
  thinking: 'El Copiloto está pensando...',
  querying: 'Consultando esquema...',
  visualizing: 'Generando visualización...',
  error: 'Sin conexión con el agente',
};

export function CopilotChatWidget() {
  const { toggleDrawer, drawerOpen, status, unread } = useCopilotChatContext();
  const pending = status !== 'idle';

  if (drawerOpen) return null;

  return (
    <button
      type="button"
      onClick={toggleDrawer}
      aria-label={STATUS_HINT[status] ?? STATUS_HINT.idle}
      title={STATUS_HINT[status] ?? STATUS_HINT.idle}
      data-testid="copilot-widget"
      className="group fixed bottom-6 right-6 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 via-indigo-500 to-amber-500 text-white shadow-[0_18px_40px_rgba(79,70,229,0.45)] transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
    >
      <span className="absolute inset-0 rounded-full border border-indigo-300/40" />
      {pending && status !== 'error' && (
        <span
          data-testid="copilot-widget-pulse"
          className="absolute inset-0 animate-ping rounded-full bg-indigo-400/30"
          aria-hidden="true"
        />
      )}
      <Bot className="relative h-6 w-6" />
      {unread > 0 && (
        <span
          data-testid="copilot-widget-badge"
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 font-mono text-[10px] font-bold text-slate-950"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
      <span className="pointer-events-none absolute right-16 hidden whitespace-nowrap rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-1.5 text-[11px] text-slate-200 shadow-xl group-hover:block">
        Habla con el Copiloto
      </span>
    </button>
  );
}
