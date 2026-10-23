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
  '¡Hola! Soy el **Copiloto Agéntico de Midas**. Introspecciono las fuentes conectadas a tu sesión activa y respondo en lenguaje natural con narrativa ejecutiva y gráficos Apache ECharts.',
  'Puedes consultarme sobre tus datos cargados, linaje de métricas o solicitar la materialización de vistas en la capa Gold.',
  '¿Qué analizamos hoy?',
].join('\n\n');

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
  activeRole?: string;
  setActiveRole: (role: string) => void;
  drawerOpen: boolean;
  expanded: boolean;
  unread: number;
  send: (text: string, threadIdOverride?: string) => Promise<void>;
  approvePipeline: (messageId: string) => Promise<void>;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  toggleExpanded: () => void;
  startNewChat: () => void;
  loadSessionMessages: (messages: CopilotMessage[], newThreadId: string) => void;
  setThreadId: (id: string) => void;
  setOnTurnComplete?: (callback: (threadId: string) => void) => void;
}

export function useCopilotChat(options?: { activeRole?: string }): CopilotChatController {
  const [messages, setMessages] = useState<CopilotMessage[]>(() => [createWelcomeMessage()]);
  const [status, setStatus] = useState<CopilotAgentStatus>('idle');
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [unread, setUnread] = useState(0);
  const [threadId, setThreadIdState] = useState<string>(() => createId('session'));
  // El ref mantiene el hilo vigente de forma síncrona para que un `send` disparado
  // justo después de `setThreadId` no reutilice el identificador anterior.
  const threadIdRef = useRef(threadId);
  const setThreadId = useCallback((id: string) => {
    threadIdRef.current = id;
    setThreadIdState(id);
  }, []);
  const [activeRole, setActiveRoleState] = useState<string>(() => options?.activeRole || 'director_general');
  const activeRoleRef = useRef(activeRole);
  activeRoleRef.current = activeRole;

  const setActiveRole = useCallback((role: string) => {
    setActiveRoleState(role);
    activeRoleRef.current = role;
  }, []);

  const phaseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const wasOpenRef = useRef(false);
  const onTurnCompleteRef = useRef<((threadId: string) => void) | null>(null);

  const setOnTurnComplete = useCallback((callback: (threadId: string) => void) => {
    onTurnCompleteRef.current = callback;
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
    async (text: string, threadIdOverride?: string) => {
      const content = text.trim();
      if (!content) return;

      // Un turno pertenece siempre a un único hilo conversacional. Si el llamador
      // acaba de crear/seleccionar una sesión, ese identificador manda sobre el
      // estado (posiblemente aún no renderizado) del hook.
      const activeThreadId = threadIdOverride?.trim() || threadIdRef.current;
      if (activeThreadId !== threadIdRef.current) {
        setThreadId(activeThreadId);
      }

      appendMessage(resolveUserMessage(content));
      setStatus('thinking');
      clearPhaseTimers();

      phaseTimers.current = PHASE_TIMERS.map((phase) =>
        setTimeout(() => {
          setStatus((current) => (current === 'idle' || current === 'error' ? current : phase.status));
        }, phase.at),
      );

      try {
        const payload = await sendChatMessage({
          message: content,
          threadId: activeThreadId,
          userRole: activeRoleRef.current,
        });
        // El backend es la fuente de verdad del hilo (por ejemplo, si él generó
        // el identificador). Adoptarlo evita crear una sesión nueva en el turno
        // siguiente.
        const responseThreadId = payload.thread_id?.trim();
        if (responseThreadId && responseThreadId !== activeThreadId) {
          setThreadId(responseThreadId);
        }
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
        onTurnCompleteRef.current?.(responseThreadId || activeThreadId);
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
    [appendMessage, clearPhaseTimers, resolveUserMessage, setThreadId],
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
  }, [clearPhaseTimers, setThreadId]);

  const loadSessionMessages = useCallback(
    (newMessages: CopilotMessage[], newThreadId: string) => {
      clearPhaseTimers();
      setThreadId(newThreadId);
      setMessages(newMessages.length > 0 ? newMessages : [createWelcomeMessage()]);
      setStatus('idle');
    },
    [clearPhaseTimers, setThreadId]
  );

  wasOpenRef.current = drawerOpen;

  return useMemo(
    () => ({
      messages,
      status,
      suggestions,
      threadId,
      activeRole,
      setActiveRole,
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
      activeRole,
      setActiveRole,
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
