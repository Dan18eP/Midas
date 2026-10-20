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
      className="group fixed bottom-6 right-6 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-[#B8860B] hover:bg-[#D4AF37] text-[#FFFFFF] shadow-[0_10px_30px_rgba(184,134,11,0.3)] transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/40"
    >
      <span className="absolute inset-0 rounded-full border border-[#D4AF37]/50" />
      {pending && status !== 'error' && (
        <span
          data-testid="copilot-widget-pulse"
          className="absolute inset-0 animate-ping rounded-full bg-[#D4AF37]/40"
          aria-hidden="true"
        />
      )}
      <Bot className="relative h-6 w-6" />
      {unread > 0 && (
        <span
          data-testid="copilot-widget-badge"
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#D4AF37] px-1 font-mono text-[10px] font-bold text-[#1C1E21]"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
      <span className="pointer-events-none absolute right-16 hidden whitespace-nowrap rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] px-2.5 py-1.5 text-[11px] text-[#1C1E21] shadow-xl group-hover:block">
        Habla con el Copiloto
      </span>
    </button>
  );
}
