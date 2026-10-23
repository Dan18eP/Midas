'use client';

/**
 * Midas - SessionContext & Restoration Engine.
 *
 * Historia de Usuario: HU-FRONT-07 / ADR-010
 * Autor: Dilan Chávez (@dilandcv)
 * Centraliza la orquestación multi-sesión, restauración de estado (Canvas + Chat),
 * y persistencia bidireccional contra PostgreSQL.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { MidasNodeData } from '@/types/canvas';
import type {
  ChatSessionDetail,
  ChatSessionSummary,
  GroupedSessions,
  SessionDateGroup,
  TopologyStateDTO,
} from '@/types/session';
import {
  listSessions,
  createSession as apiCreateSession,
  getSessionDetail,
  updateSessionTopology,
  deleteSession as apiDeleteSession,
} from '@/services/sessionService';

export type WorkspaceMode = 'welcome' | 'active';

export interface SessionContextValue {
  activeSessionId: string | null;
  activeSession: ChatSessionDetail | null;
  activeTopology: TopologyStateDTO | null;
  sessions: ChatSessionSummary[];
  groupedSessions: GroupedSessions[];
  workspaceMode: WorkspaceMode;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  fetchSessions: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  startNewSession: () => void;
  createAndSelectSession: (title?: string, initialTopology?: TopologyStateDTO) => Promise<string>;
  saveTopology: (nodes: Node<MidasNodeData>[], edges: Edge[]) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setActiveTopology: React.Dispatch<React.SetStateAction<TopologyStateDTO | null>>;
  clearError: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function groupSessionsByDate(sessions: ChatSessionSummary[]): GroupedSessions[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfSevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const buckets: Record<SessionDateGroup, ChatSessionSummary[]> = {
    today: [],
    yesterday: [],
    past_week: [],
    older: [],
  };

  for (const session of sessions) {
    const rawDate = session.updated_at || session.created_at;
    const time = new Date(rawDate).getTime();

    if (isNaN(time)) {
      buckets.older.push(session);
      continue;
    }

    if (time >= startOfToday) {
      buckets.today.push(session);
    } else if (time >= startOfYesterday) {
      buckets.yesterday.push(session);
    } else if (time >= startOfSevenDaysAgo) {
      buckets.past_week.push(session);
    } else {
      buckets.older.push(session);
    }
  }

  const result: GroupedSessions[] = [];
  if (buckets.today.length > 0) {
    result.push({ group: 'today', label: 'Hoy', sessions: buckets.today });
  }
  if (buckets.yesterday.length > 0) {
    result.push({ group: 'yesterday', label: 'Ayer', sessions: buckets.yesterday });
  }
  if (buckets.past_week.length > 0) {
    result.push({ group: 'past_week', label: 'Últimos 7 días', sessions: buckets.past_week });
  }
  if (buckets.older.length > 0) {
    result.push({ group: 'older', label: 'Anteriores', sessions: buckets.older });
  }

  return result;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSessionDetail | null>(null);
  const [activeTopology, setActiveTopology] = useState<TopologyStateDTO | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('welcome');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Conserva la última topología no vacía de la sesión. Al iniciar una nueva
  // conversación el usuario sigue trabajando sobre el mismo espacio de datos
  // (p. ej. el flujo de Walmart) en lugar de volver a la topología demo.
  const lastTopologyRef = useRef<TopologyStateDTO | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listSessions();
      setSessions(data);
    } catch (err) {
      // Si la API no está disponible o falla, mantener lista vacía sin romper la UI
      console.warn('No se pudieron recuperar las sesiones:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (activeTopology && activeTopology.nodes.length > 0) {
      lastTopologyRef.current = activeTopology;
    }
  }, [activeTopology]);

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsRestoring(true);
      setError(null);
      try {
        const detail = await getSessionDetail(sessionId, controller.signal);
        setActiveSessionId(sessionId);
        setActiveSession(detail);

        if (detail.topology_state && detail.topology_state.nodes) {
          setActiveTopology(detail.topology_state);
        } else {
          setActiveTopology(null);
        }

        // Si la sesión tiene mensajes o topología, transicionar a Active Canvas
        setWorkspaceMode('active');
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Error cargando la sesión';
        setError(msg);
      } finally {
        setIsRestoring(false);
      }
    },
    []
  );

  const startNewSession = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setActiveSessionId(null);
    setActiveSession(null);
    setActiveTopology(null);
    lastTopologyRef.current = null;
    setWorkspaceMode('welcome');
    setError(null);
  }, []);

  const createAndSelectSession = useCallback(
    async (title?: string, initialTopology?: TopologyStateDTO): Promise<string> => {
      setIsLoading(true);
      setError(null);
      try {
        // Si la nueva conversación no define una topología explícita, hereda la
        // última topología activa para no perder el flujo de datos ya construido.
        const topologyToPersist = initialTopology ?? lastTopologyRef.current ?? undefined;
        const newSession = await apiCreateSession({
          title,
          topology_state: topologyToPersist,
        });
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.session_id);
        setActiveTopology(topologyToPersist || null);
        setActiveSession({
          session_id: newSession.session_id,
          user_id: newSession.user_id,
          title: newSession.title,
          created_at: newSession.created_at,
          updated_at: newSession.updated_at,
          metadata: newSession.metadata,
          topology_state: topologyToPersist || null,
          messages: [],
        });
        setWorkspaceMode('active');
        return newSession.session_id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error creando nueva sesión';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const saveTopology = useCallback(
    async (nodes: Node<MidasNodeData>[], edges: Edge[]) => {
      if (!activeSessionId) return;

      const payload: TopologyStateDTO = { nodes, edges };
      setActiveTopology(payload);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await updateSessionTopology(activeSessionId, payload);
        } catch (err) {
          console.error('Error auto-guardando topología:', err);
        }
      }, 1000);
    },
    [activeSessionId]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await apiDeleteSession(sessionId);
        setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
        if (activeSessionId === sessionId) {
          startNewSession();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error eliminando sesión';
        setError(msg);
        throw err;
      }
    },
    [activeSessionId, startNewSession]
  );

  const groupedSessions = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  const value = useMemo<SessionContextValue>(
    () => ({
      activeSessionId,
      activeSession,
      activeTopology,
      sessions,
      groupedSessions,
      workspaceMode,
      isLoading,
      isRestoring,
      error,
      fetchSessions,
      selectSession,
      startNewSession,
      createAndSelectSession,
      saveTopology,
      deleteSession,
      setWorkspaceMode,
      setActiveTopology,
      clearError,
    }),
    [
      activeSessionId,
      activeSession,
      activeTopology,
      sessions,
      groupedSessions,
      workspaceMode,
      isLoading,
      isRestoring,
      error,
      fetchSessions,
      selectSession,
      startNewSession,
      createAndSelectSession,
      saveTopology,
      deleteSession,
      setWorkspaceMode,
      setActiveTopology,
      clearError,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    return {
      activeSessionId: null,
      activeSession: null,
      activeTopology: null,
      sessions: [],
      groupedSessions: [],
      workspaceMode: 'welcome',
      isLoading: false,
      isRestoring: false,
      error: null,
      fetchSessions: async () => {},
      selectSession: async () => {},
      startNewSession: () => {},
      createAndSelectSession: async () => 'session_mock',
      saveTopology: async () => {},
      deleteSession: async () => {},
      setWorkspaceMode: () => {},
      setActiveTopology: () => {},
      clearError: () => {},
    };
  }
  return context;
}
