'use client';

import { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatStatusIndicator } from './ChatStatusIndicator';
import { PromptComposer } from './PromptComposer';
import { QuickPromptPills } from './QuickPromptPills';
import { useCopilotChatContext } from './CopilotChatContext';

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
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="chat-conversation">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto py-3 pr-1">
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

      <div className="space-y-3 border-t border-slate-800/80 pt-3">
        <QuickPromptPills pills={suggestions} onSelect={send} disabled={!idle} />
        <PromptComposer onSubmit={send} suggestions={suggestions} status={status} inputRef={inputRef} />
      </div>
    </div>
  );
}
