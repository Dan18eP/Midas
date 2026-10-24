import { useCallback, useMemo, useRef, useState } from 'react';
import { CopilotApiError, sendChatMessage } from './copilotApi';
import type { CopilotAgentStatus, CopilotMessage, CopilotRole, EChartsOption } from './types';
import { detectTextToGoldProposal, TEXT_TO_GOLD_CONFIRMATION } from './textToGold';

export const DEFAULT_SUGGESTIONS = [
  'Explorar tablas de CRM',
  'Analizar cumplimiento de presupuesto',
  'Crear nuevo Mart Gold',
];

export function createDynamicWelcomeMessage(connectedSources?: Array<{ name: string; source_type?: string }>): CopilotMessage {
  const hasSources = connectedSources && connectedSources.length > 0;
  const lines = [
    '¡Hola! Soy el **Copiloto Agéntico de Midas**.',
    'Estoy conectado a los datos de tu sesión activa para responder en lenguaje natural con narrativa ejecutiva, gráficos interactivos y generación de tablas Gold personalizadas.',
  ];

  if (hasSources) {
    lines.push('\n**Fuentes conectadas en esta sesión:**');
    connectedSources.slice(0, 5).forEach((s) => {
      lines.push(`- **${s.source_type || 'Fuente'}**: \`${s.name}\``);
    });
    lines.push('\n¿Qué análisis deseas realizar hoy? Puedes pedirme:');
    lines.push('- *Resumir los registros de mi dataset*');
    lines.push('- *Generar un desglose agrupado por categoría o fecha*');
    lines.push('- *Materializar este reporte como tabla Gold diaria*');
  } else {
    lines.push('\nFuentes activas:');
    lines.push('- PostgreSQL: `crm_operaciones` (clientes, transacciones)');
    lines.push('- Excel: `Presupuesto_Corporativo_2026.xlsx` (Presupuesto_Metas, Costos_Operativos)');
    lines.push('- API REST: `helpdesk_tickets_live` (tickets, satisfacción CSAT)');
    lines.push('¿Qué analizamos hoy?');
  }

  const suggestions = hasSources
    ? [
        `Resumir datos de ${connectedSources[0].name.slice(0, 20)}`,
        'Consultar totales agrupados',
        'Definir nuevo Mart Gold',
      ]
    : DEFAULT_SUGGESTIONS;

  return {
    id: createId('welcome'),
    role: 'assistant',
    content: lines.join('\n'),
    timestamp: new Date().toISOString(),
    intent: 'discovery',
    suggestions,
  };
}

const PHASE_TIMERS = [
  { at: 900, status: 'querying' as CopilotAgentStatus },
  { at: 2400, status: 'visualizing' as CopilotAgentStatus },
];

let messageCounter = 0;

function createId(prefix: string): string {
  messageCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${messageCounter}`;
}

export function createWelcomeMessage(connectedSources?: Array<{ name: string; source_type?: string }>): CopilotMessage {
  return createDynamicWelcomeMessage(connectedSources);
}

export interface CopilotChatController {
  messages: CopilotMessage[];
  status: CopilotAgentStatus;
  suggestions: string[];
  threadId: string;
  inferenceMode: 'local' | 'cloud';
  setInferenceMode: (mode: 'local' | 'cloud') => void;
  activeRole?: string;
  setActiveRole: (role: string) => void;
  drawerOpen: boolean;
  expanded: boolean;
  unread: number;
  send: (text: string) => Promise<void>;
  approvePipeline: (messageId: string) => Promise<void>;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  toggleExpanded: () => void;
  startNewChat: (sources?: Array<{ name: string; source_type?: string }>) => void;
  loadSessionMessages: (messages: CopilotMessage[], newThreadId: string, sources?: Array<{ name: string; source_type?: string }>) => void;
  setThreadId: (id: string) => void;
  setOnTurnComplete?: (callback: (threadId: string) => void) => void;
}

export function useCopilotChat(options?: { activeRole?: string }): CopilotChatController {
  const [messages, setMessages] = useState<CopilotMessage[]>(() => [createWelcomeMessage()]);
  const [status, setStatus] = useState<CopilotAgentStatus>('idle');
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [inferenceMode, setInferenceMode] = useState<'local' | 'cloud'>('cloud');
  const inferenceModeRef = useRef(inferenceMode);
  inferenceModeRef.current = inferenceMode;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [unread, setUnread] = useState(0);
  const [threadId, setThreadId] = useState<string>(() => createId('session'));
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
        const payload = await sendChatMessage({
          message: content,
          threadId,
          userRole: activeRoleRef.current,
          inferenceMode: inferenceModeRef.current,
        });
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

  const startNewChat = useCallback((sources?: Array<{ name: string; source_type?: string }>) => {
    clearPhaseTimers();
    setThreadId(createId('session'));
    setMessages([createWelcomeMessage(sources)]);
    setSuggestions(DEFAULT_SUGGESTIONS);
    setStatus('idle');
  }, [clearPhaseTimers]);

  const loadSessionMessages = useCallback(
    (newMessages: CopilotMessage[], newThreadId: string, sources?: Array<{ name: string; source_type?: string }>) => {
      clearPhaseTimers();
      setThreadId(newThreadId);
      setMessages(newMessages.length > 0 ? newMessages : [createWelcomeMessage(sources)]);
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
      inferenceMode,
      setInferenceMode,
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
      inferenceMode,
      setInferenceMode,
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
