'use client';

import { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatStatusIndicator } from './ChatStatusIndicator';
import { PromptComposer } from './PromptComposer';
import { QuickPromptPills } from './QuickPromptPills';
import { useCopilotChatContext } from './CopilotChatContext';
import { ChatParticleBackground } from './ChatParticleBackground';

export interface ChatConversationProps {
  autoFocus?: boolean;
}

export function ChatConversation({ autoFocus = false }: ChatConversationProps) {
  const { messages, status, suggestions, send, approvePipeline } = useCopilotChatContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const idle = status === 'idle' || status === 'error';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden" data-testid="chat-conversation">
      {/* Fondo Animado Aether Flow Midas (Partículas doradas sobre canvas transparente) */}
      <ChatParticleBackground />

      <div ref={scrollRef} className="relative z-10 min-h-0 flex-1 space-y-4 overflow-y-auto py-3 pr-1">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onSuggestion={idle ? send : undefined}
            onApprove={approvePipeline}
          />
        ))}
        <ChatStatusIndicator status={status} />
      </div>

      <div className="relative z-10 space-y-3 border-t border-[#F0EDE7] pt-3">
        <QuickPromptPills pills={suggestions} onSelect={send} disabled={!idle} />
        <PromptComposer onSubmit={send} suggestions={suggestions} status={status} inputRef={inputRef} />
      </div>
    </div>
  );
}
