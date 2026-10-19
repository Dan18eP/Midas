'use client';

import { Sparkles } from 'lucide-react';
import { ChatConversation } from './ChatConversation';
import { useCopilotChatContext } from './CopilotChatContext';

export function CopilotChatPanel() {
  const { status } = useCopilotChatContext();

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="copilot-panel">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-950 text-indigo-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-100">Copiloto Agéntico</h2>
            <span className="text-[10px] text-slate-400">LangGraph · Data Storytelling</span>
          </div>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
            status === 'error'
              ? 'border-rose-700/50 bg-rose-950/60 text-rose-400'
              : 'border-emerald-600/40 bg-emerald-950/60 text-emerald-400'
          }`}
        >
          {status === 'error' ? 'Sin conexión' : 'En Línea'}
        </span>
      </div>

      <ChatConversation />
    </div>
  );
}
