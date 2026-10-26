import { useCallback, useMemo, useRef, useState } from 'react';
import { CopilotApiError, sendChatMessage, streamChatMessage } from './copilotApi';
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
    'Estoy conectado a los datos de tu sesión activa para responder en lenguaje natural con narrativa ejecutiva, gráficos interactivos y generación de tablas Gold personalizadas para cualquier materia de negocio.',
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
    lines.push('\nConjuntos de datos disponibles:');
    lines.push('- Base Operacional: `crm_operaciones` (clientes, transacciones)');
    lines.push('- Planificación: `Presupuesto_Corporativo_2026.xlsx` (metas, costos)');
    lines.push('- Soporte y Servicio: `helpdesk_tickets_live` (tickets, satisfacción CSAT)');
    lines.push('Conecta cualquier archivo o base de datos (RRHH, Salud, Logística, Finanzas, etc.) para comenzar.');
  }

  const suggestions = hasSources
    ? [
        `Resumir datos de ${connectedSources[0].name.slice(0, 20)}`,
        'Consultar totales agrupados',
        'Materializar reporte como tabla Gold diaria',
      ]
    : DEFAULT_SUGGESTIONS;

  return {
    id: 'welcome_message_initial',
    role: 'assistant',
    content: lines.join('\n'),
    timestamp: '2026-10-25T00:00:00.000Z',
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
  connectionId?: string;
  setConnectionId: (id?: string) => void;
  inferenceMode: 'local' | 'cloud';
  setInferenceMode: (mode: 'local' | 'cloud') => void;
  activeRole?: string;
  setActiveRole: (role: string) => void;
  drawerOpen: boolean;
  expanded: boolean;
  unread: number;
  send: (text: string, sqlQuery?: string) => Promise<void>;
  approvePipeline: (messageId: string) => Promise<void>;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  toggleExpanded: () => void;
  startNewChat: (sources?: Array<{ name: string; source_type?: string }>, connectionId?: string) => void;
  loadSessionMessages: (messages: CopilotMessage[], newThreadId: string, sources?: Array<{ name: string; source_type?: string }>, connectionId?: string) => void;
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
  const [connectionId, setConnectionIdState] = useState<string | undefined>();
  const connectionIdRef = useRef<string | undefined>(connectionId);
  connectionIdRef.current = connectionId;

  const setConnectionId = useCallback((id?: string) => {
    setConnectionIdState(id);
    connectionIdRef.current = id;
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
    async (text: string, sqlQuery?: string) => {
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

      const assistantId = createId('assistant');
      let streamingContent = '';
      let isStreaming = false;

      try {
        const payload = await streamChatMessage(
          {
            message: content,
            threadId,
            connectionId: connectionIdRef.current,
            userRole: activeRoleRef.current,
            inferenceMode: inferenceModeRef.current,
            sqlQuery,
          },
          (delta) => {
            streamingContent += delta;
            if (!isStreaming) {
              isStreaming = true;
              clearPhaseTimers();
              setStatus('thinking');
              setMessages((current) => [
                ...current,
                {
                  id: assistantId,
                  role: 'assistant',
                  content: streamingContent,
                  timestamp: new Date().toISOString(),
                },
              ]);
            } else {
              setMessages((current) =>
                current.map((m) =>
                  m.id === assistantId ? { ...m, content: streamingContent } : m,
                ),
              );
            }
          },
          (statusMsg) => {
            if (statusMsg.includes('Trino') || statusMsg.includes('motor')) {
              setStatus('querying');
            } else if (statusMsg.includes('síntesis') || statusMsg.includes('visualización')) {
              setStatus('visualizing');
            } else {
              setStatus('thinking');
            }
          },
        );
        const assistantMessage: CopilotMessage = {
          id: assistantId,
          role: 'assistant',
          content: payload.response || streamingContent,
          timestamp: new Date().toISOString(),
          intent: payload.intent,
          needsClarification: payload.needs_clarification,
          suggestions: payload.suggestions,
          echartsOption: (payload.echarts_option ?? null) as EChartsOption | null,
          metricsSummary: payload.metrics_summary,
          textToGold: detectTextToGoldProposal(payload),
          approvalState: 'idle',
          sql: payload.sql || sqlQuery,
        };
        clearPhaseTimers();
        if (isStreaming) {
          setMessages((current) =>
            current.map((m) => (m.id === assistantId ? assistantMessage : m)),
          );
        } else {
          appendMessage(assistantMessage);
        }
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
      const targetMsg = messages.find((m) => m.id === messageId);
      const targetSql = targetMsg?.sql;
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, approvalState: 'submitting' as const } : message,
        ),
      );
      await send(TEXT_TO_GOLD_CONFIRMATION, targetSql);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId && message.approvalState === 'submitting'
            ? { ...message, approvalState: 'approved' as const }
            : message,
        ),
      );
    },
    [messages, send, status],
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

  const startNewChat = useCallback((sources?: Array<{ name: string; source_type?: string }>, newConnectionId?: string) => {
    clearPhaseTimers();
    setThreadId(createId('session'));
    setConnectionIdState(newConnectionId);
    connectionIdRef.current = newConnectionId;
    setMessages([createWelcomeMessage(sources)]);
    setSuggestions(DEFAULT_SUGGESTIONS);
    setStatus('idle');
  }, [clearPhaseTimers]);

  const loadSessionMessages = useCallback(
    (newMessages: CopilotMessage[], newThreadId: string, sources?: Array<{ name: string; source_type?: string }>, newConnectionId?: string) => {
      clearPhaseTimers();
      setThreadId(newThreadId);
      setConnectionIdState(newConnectionId);
      connectionIdRef.current = newConnectionId;
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
      connectionId,
      setConnectionId,
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
      connectionId,
      setConnectionId,
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
