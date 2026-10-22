import { useCallback, useMemo, useRef, useState } from 'react';
import { CopilotApiError, sendChatMessage } from './copilotApi';
import type { CopilotAgentStatus, CopilotMessage, CopilotRole, EChartsOption } from './types';
import { detectTextToGoldProposal, TEXT_TO_GOLD_CONFIRMATION } from './textToGold';

export const DEFAULT_SUGGESTIONS = [
  'Explorar tablas de CRM',
  'Analizar cumplimiento de presupuesto',
  'Crear nuevo Mart Gold',
];

const WELCOME_CONTENT = [
  '¡Hola! Soy el **Copiloto Agéntico de Midas**. Introspecciono tus fuentes conectadas y respondo en lenguaje natural con narrativa ejecutiva y gráficos Apache ECharts.',
  'Fuentes activas:',
  '- PostgreSQL: `crm_operaciones` (clientes, transacciones)',
  '- Excel: `Presupuesto_Corporativo_2026.xlsx` (Presupuesto_Metas, Costos_Operativos)',
  '- API REST: `helpdesk_tickets_live` (tickets, satisfacción CSAT)',
  '¿Qué analizamos hoy?',
].join('\n');

const PHASE_TIMERS = [
  { at: 900, status: 'querying' as CopilotAgentStatus },
  { at: 2400, status: 'visualizing' as CopilotAgentStatus },
];

let messageCounter = 0;

function createId(prefix: string): string {
  messageCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${messageCounter}`;
}

function createWelcomeMessage(): CopilotMessage {
  return {
    id: createId('welcome'),
    role: 'assistant',
    content: WELCOME_CONTENT,
    timestamp: new Date().toISOString(),
    intent: 'discovery',
    suggestions: DEFAULT_SUGGESTIONS,
  };
}

export interface CopilotChatController {
  messages: CopilotMessage[];
  status: CopilotAgentStatus;
  suggestions: string[];
  threadId: string;
  drawerOpen: boolean;
  expanded: boolean;
  unread: number;
  send: (text: string) => Promise<void>;
  approvePipeline: (messageId: string) => Promise<void>;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  toggleExpanded: () => void;
  startNewChat: () => void;
  loadSessionMessages: (messages: CopilotMessage[], newThreadId: string) => void;
  setThreadId: (id: string) => void;
  setOnTurnComplete?: (cb: (threadId: string) => void) => void;
}

export function useCopilotChat(options?: { onTurnComplete?: (threadId: string) => void }): CopilotChatController {
  const [messages, setMessages] = useState<CopilotMessage[]>(() => [createWelcomeMessage()]);
  const [status, setStatus] = useState<CopilotAgentStatus>('idle');
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [unread, setUnread] = useState(0);
  const [threadId, setThreadId] = useState<string>(() => createId('session'));

  const phaseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const wasOpenRef = useRef(false);
  const onTurnCompleteRef = useRef(options?.onTurnComplete);
  onTurnCompleteRef.current = options?.onTurnComplete;

  const setOnTurnComplete = useCallback((cb: (threadId: string) => void) => {
    onTurnCompleteRef.current = cb;
  }, []);

  const clearPhaseTimers = useCallback(() => {
    phaseTimers.current.forEach((timer) => clearTimeout(timer));
    phaseTimers.current = [];
  }, []);

  const appendMessage = useCallback((message: CopilotMessage) => {
    setMessages((current) => [...current, message]);
    setUnread((count) => {
      if (!wasOpenRef.current && message.role === 'assistant') return count + 1;
      return count;
    });
  }, []);

  const resolveUserMessage = useCallback(
    (content: string): CopilotMessage => ({
      id: createId('user'),
      role: 'user' as CopilotRole,
      content,
      timestamp: new Date().toISOString(),
    }),
    [],
  );

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content) return;

      appendMessage(resolveUserMessage(content));
      setStatus('thinking');
      clearPhaseTimers();

      phaseTimers.current = PHASE_TIMERS.map((phase) =>
        setTimeout(() => {
          setStatus((current) => (current === 'idle' || current === 'error' ? current : phase.status));
        }, phase.at),
      );

      try {
        const payload = await sendChatMessage({ message: content, threadId });
        const assistantMessage: CopilotMessage = {
          id: createId('assistant'),
          role: 'assistant',
          content: payload.response,
          timestamp: new Date().toISOString(),
          intent: payload.intent,
          needsClarification: payload.needs_clarification,
          suggestions: payload.suggestions,
          echartsOption: (payload.echarts_option ?? null) as EChartsOption | null,
          metricsSummary: payload.metrics_summary,
          textToGold: detectTextToGoldProposal(payload),
          approvalState: 'idle',
        };
        clearPhaseTimers();
        appendMessage(assistantMessage);
        setSuggestions(payload.suggestions && payload.suggestions.length > 0 ? payload.suggestions : DEFAULT_SUGGESTIONS);
        setStatus('idle');
        onTurnCompleteRef.current?.(threadId);
      } catch (cause) {
        if ((cause as Error)?.name === 'AbortError') return;
        clearPhaseTimers();
        const message = cause instanceof CopilotApiError ? cause.message : 'Ocurrió un error inesperado con el Copiloto.';
        appendMessage({
          id: createId('error'),
          role: 'assistant',
          content: message,
          timestamp: new Date().toISOString(),
          error: true,
          suggestions: ['Reintentar conexión con midas-api'],
        });
        setStatus('error');
      }
    },
    [appendMessage, clearPhaseTimers, resolveUserMessage, threadId],
  );

  const approvePipeline = useCallback(
    async (messageId: string) => {
      if (status !== 'idle' && status !== 'error') return;
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, approvalState: 'submitting' as const } : message,
        ),
      );
      await send(TEXT_TO_GOLD_CONFIRMATION);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId && message.approvalState === 'submitting'
            ? { ...message, approvalState: 'approved' as const }
            : message,
        ),
      );
    },
    [send, status],
  );

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    setUnread(0);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((open) => {
      if (!open) setUnread(0);
      return !open;
    });
  }, []);

  const toggleExpanded = useCallback(() => setExpanded((value) => !value), []);

  const startNewChat = useCallback(() => {
    clearPhaseTimers();
    setThreadId(createId('session'));
    setMessages([createWelcomeMessage()]);
    setSuggestions(DEFAULT_SUGGESTIONS);
    setStatus('idle');
  }, [clearPhaseTimers]);

  const loadSessionMessages = useCallback(
    (newMessages: CopilotMessage[], newThreadId: string) => {
      clearPhaseTimers();
      setThreadId(newThreadId);
      setMessages(newMessages.length > 0 ? newMessages : [createWelcomeMessage()]);
      setStatus('idle');
    },
    [clearPhaseTimers]
  );

  wasOpenRef.current = drawerOpen;

  return useMemo(
    () => ({
      messages,
      status,
      suggestions,
      threadId,
      drawerOpen,
      expanded,
      unread,
      send,
      approvePipeline,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      toggleExpanded,
      startNewChat,
      loadSessionMessages,
      setThreadId,
      setOnTurnComplete,
    }),
    [
      messages,
      status,
      suggestions,
      threadId,
      drawerOpen,
      expanded,
      unread,
      send,
      approvePipeline,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      toggleExpanded,
      startNewChat,
      loadSessionMessages,
      setThreadId,
      setOnTurnComplete,
    ],
  );
}
