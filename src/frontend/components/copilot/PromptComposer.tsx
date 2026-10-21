'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Loader2, Send } from 'lucide-react';
import type { CopilotAgentStatus } from './types';

const STATUS_PLACEHOLDER: Partial<Record<CopilotAgentStatus, string>> = {
  thinking: 'El Copiloto está analizando tu solicitud...',
  querying: 'Consultando esquema y validando gobernanza...',
  visualizing: 'Generando visualización y narrativa...',
  error: 'Revisa la conexión con midas-api y vuelve a intentar...',
};

export interface PromptComposerProps {
  onSubmit: (text: string) => void;
  suggestions: string[];
  status: CopilotAgentStatus;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}

export function PromptComposer({ onSubmit, suggestions, status, inputRef }: PromptComposerProps) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const localRef = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const textareaRef = inputRef ?? localRef;

  const busy = status !== 'idle' && status !== 'error';

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return [];
    return suggestions
      .filter((suggestion) => suggestion.toLowerCase().includes(query) && suggestion.trim().toLowerCase() !== query)
      .slice(0, 4);
  }, [suggestions, value]);

  const showSuggestions = focused && matches.length > 0;

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <div className="relative" data-testid="prompt-composer">
      {showSuggestions && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Autocompletado del Copiloto"
          className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] shadow-xl backdrop-blur"
        >
          {matches.map((match, index) => (
            <li key={match} role="option" aria-selected="false">
              <button
                type="button"
                data-testid={`autosuggest-option-${index}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setValue(match);
                  textareaRef.current?.focus();
                }}
                className="w-full px-3 py-2 text-left text-[11px] text-[#1C1E21] transition hover:bg-[#FAFAFA]"
              >
                {match}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 rounded-2xl border border-[#E8E4DC] bg-[#FAFAFA] p-2 focus-within:border-[#D4AF37] focus-within:bg-[#FFFFFF] transition-colors">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={busy}
          placeholder={STATUS_PLACEHOLDER[status] ?? "Pregunta en lenguaje natural o escribe 'Crea vista Gold...'"}
          aria-label="Mensaje para el Copiloto Agéntico"
          data-testid="copilot-input"
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit(value);
            }
          }}
          className="max-h-28 min-h-[36px] flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[12px] text-[#1C1E21] placeholder-[#4B4639]/50 focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => submit(value)}
          disabled={busy || value.trim().length === 0}
          aria-label="Enviar mensaje"
          data-testid="copilot-send-button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#B8860B] text-white transition hover:bg-[#D4AF37] disabled:cursor-not-allowed disabled:bg-[#F0EDE7] disabled:text-[#4B4639]/40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>

      <p className="mt-1.5 flex items-center gap-1 text-[9px] text-[#4B4639]/60">
        <CornerDownLeft className="h-2.5 w-2.5" />
        Enter para enviar · Shift+Enter para salto de línea
      </p>
    </div>
  );
}
