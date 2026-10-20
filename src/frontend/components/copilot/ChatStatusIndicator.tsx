import { useEffect, useState } from 'react';
import { AlertTriangle, Cpu } from 'lucide-react';
import type { CopilotAgentStatus } from './types';

const STATUS_LABEL: Record<CopilotAgentStatus, string> = {
  idle: '',
  thinking: 'Pensando',
  querying: 'Consultando esquema',
  visualizing: 'Generando visualización',
  error: 'Sin conexión con el agente',
};

const STATUS_STEPS: Record<CopilotAgentStatus, string[]> = {
  idle: [],
  thinking: ['Analizando tu solicitud...', 'Detectando la intención...', 'Preparando contexto de sesión...'],
  querying: ['Consultando esquema...', 'Validando seguridad Zero-Trust...', 'Ejecutando consulta gobernada...'],
  visualizing: ['Generando visualización...', 'Aplicando paleta Midas...', 'Redactando narrativa ejecutiva...'],
  error: ['No pude completar la consulta con el agente.'],
};

export interface ChatStatusIndicatorProps {
  status: CopilotAgentStatus;
}

export function ChatStatusIndicator({ status }: ChatStatusIndicatorProps) {
  const steps = STATUS_STEPS[status];
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setStepIndex(0);
    if (steps.length <= 1) return undefined;
    const interval = setInterval(() => {
      setStepIndex((current) => (current + 1) % steps.length);
    }, 1100);
    return () => clearInterval(interval);
  }, [status, steps.length]);

  if (status === 'idle') return null;

  const isError = status === 'error';
  const step = steps[stepIndex] ?? steps[0];

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="chat-status-indicator"
      data-status={status}
      className={`flex items-start gap-3 rounded-2xl border px-3 py-2.5 ${
        isError ? 'border-rose-200 bg-rose-50/70' : 'border-[#F0EDE7] bg-[#FAFAFA]'
      }`}
    >
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
          isError ? 'bg-rose-100 text-rose-600' : 'border border-[#D4AF37]/40 bg-[#FBF8EF] text-[#B8860B]'
        }`}
      >
        {isError ? <AlertTriangle className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold ${isError ? 'text-rose-700' : 'text-[#B8860B]'}`}>
            {STATUS_LABEL[status]}
          </span>
          {!isError && (
            <span className="flex items-end gap-0.5" aria-hidden="true">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1 w-1 animate-bounce rounded-full bg-[#B8860B]"
                  style={{ animationDelay: `${dot * 150}ms`, animationDuration: '900ms' }}
                />
              ))}
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-[#4B4639]">{step}</p>
      </div>
    </div>
  );
}
