'use client';

import { Sparkles } from 'lucide-react';
import { ChatConversation } from './ChatConversation';
import { useCopilotChatContext } from './CopilotChatContext';

export function CopilotChatPanel() {
  const { status } = useCopilotChatContext();

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#FFFFFF] p-3.5" data-testid="copilot-panel">
      <div className="flex items-center justify-between border-b border-[#F0EDE7] pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FBF8EF] border border-[#D4AF37] text-[#B8860B] shadow-2xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-serif font-bold text-[#1C1E21]">Copiloto Agéntico</h2>
            <span className="text-[10px] text-[#787164] font-mono">LangGraph · Data Storytelling</span>
          </div>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
            status === 'error'
              ? 'border-[#ECCFC5] bg-[#FFF8F5] text-[#A8422B]'
              : 'border-[#4D7C0F]/25 bg-[#4D7C0F]/10 text-[#4D7C0F]'
          }`}
        >
          {status === 'error' ? 'Sin conexión' : 'En Línea'}
        </span>
      </div>

      <ChatConversation />
    </div>
  );
}
