'use client';

/**
 * Midas - Consola Principal y Workspace Conversacional Multi-Sesión.
 *
 * Historia de Usuario: HU-FRONT-07 / ADR-010 & HU-FRONT-08
 * Autor: Dilan Chávez (@dilandcv)
 * Orquestador principal que integra:
 * - Panel Lateral de Historial de Sesiones Navegable (SessionHistorySidebar)
 * - Modo 1: Pantalla de Bienvenida y Lanzadores de Ingesta (WelcomeHero)
 * - Modo 2: Active Canvas & Copilot Workspace (PipelineCanvas + CopilotChatDrawer)
 * - Restauración Integral de Contexto (mensajes + topología React Flow)
 * - Catálogo Dinámico de Roles Zero-Trust e Historial de Telemetría Real (HU-FRONT-08)
 * Estrictamente sin emojis (solo SVG / Lucide).
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  CopilotChatDrawer,
  CopilotChatProvider,
  CopilotChatWidget,
  useCopilotChatContext,
} from '@/components/copilot';
import type { CopilotMessage, EChartsOption } from '@/components/copilot/types';
import { ExplainNumberDrawer, ExplainNumberProvider } from '@/components/lineage';
import {
  ZeroTrustLens,
  ZERO_TRUST_ROLE_IDS,
  buildSecurityNodePolicy,
  type ZeroTrustRole,
} from '@/components/security/ZeroTrustLens';
import { fetchSecurityRoles, setActiveUserRole, type SecurityRoleDefinition } from '@/services/securityRolesApi';
import { useTelemetryHistory } from '@/hooks/useTelemetryHistory';
import { SessionProvider, useSession } from '@/context/SessionContext';
import { SessionHistorySidebar } from '@/components/workspace/SessionHistorySidebar';
import { WelcomeHero } from '@/components/workspace/WelcomeHero';
import { listSourceConnections, getSessionDetail } from '@/services/sessionService';
import {
  INITIAL_CANVAS_NODES,
  INITIAL_CANVAS_EDGES,
  buildCanvasTopologyFromConnections,
} from '@/components/canvas/topology/initialTopology';
import { SessionAnalyticsView } from '@/components/analytics/SessionAnalyticsView';
import { Layers, BarChart3 } from 'lucide-react';

const PipelineCanvas = dynamic(
  () => import('@/components/canvas/PipelineCanvas').then((mod) => mod.PipelineCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#FFFFFF] text-[#4B4639] font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#B8860B] animate-ping" />
          <span>Cargando Canvas Topológico Midas...</span>
        </div>
      </div>
    ),
  }
);

function MidasConsoleWorkspace() {
  const [selectedRole, setSelectedRole] = useState<ZeroTrustRole>('admin');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeMainView, setActiveMainView] = useState<'canvas' | 'analytics'>('canvas');

  // HU-FRONT-08: las identidades reales provienen del catálogo del backend.
  const [roleDefinitions, setRoleDefinitions] = useState<SecurityRoleDefinition[]>([]);
  const [hasConnectedData, setHasConnectedData] = useState(false);

  // Sincronización del rol activo con el middleware backend (X-User-Role)
  useEffect(() => {
    const backendRoleId = ZERO_TRUST_ROLE_IDS[selectedRole] || 'director_general';
    setActiveUserRole(backendRoleId);
  }, [selectedRole]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetchSecurityRoles({ signal: controller.signal })
      .then((definitions) => {
        if (!cancelled) setRoleDefinitions(definitions);
      })
      .catch(() => {
        // Sin catálogo de identidades: la consola opera con el respaldo local
        // declarado. La Lente informa explícitamente que no hay evidencia.
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const activeRoleDefinition = useMemo(() => {
    const backendRoleId = ZERO_TRUST_ROLE_IDS[selectedRole];
    return roleDefinitions.find((definition) => definition.role_id === backendRoleId) ?? null;
  }, [roleDefinitions, selectedRole]);

  const securityPolicy = useMemo(
    () => (activeRoleDefinition ? buildSecurityNodePolicy(activeRoleDefinition) : null),
    [activeRoleDefinition],
  );

  // HU-FRONT-08: la línea de tiempo del scrubber se hidrata con el historial real.
  useTelemetryHistory();

  const {
    workspaceMode,
    activeSessionId,
    activeSession,
    activeTopology,
    createAndSelectSession,
    setWorkspaceMode,
    saveTopology,
    fetchSessions,
    refreshActiveSession,
  } = useSession();

  const copilotChat = useCopilotChatContext();

  const [availableSources, setAvailableSources] = useState<any[]>([]);

  // Topología viva derivada de las fuentes reales conectadas
  const dynamicTopology = useMemo(
    () => buildCanvasTopologyFromConnections(availableSources),
    [availableSources],
  );

  const currentNodes = useMemo(() => {
    const rawNodes =
      activeTopology?.nodes && activeTopology.nodes.length > 0
        ? activeTopology.nodes
        : dynamicTopology.nodes;

    const goldTables: string[] =
      (activeSession?.metadata?.gold_tables as string[]) ||
      (activeSession?.metadata?.gold_table ? [activeSession.metadata.gold_table as string] : []);
    const hasGold = goldTables.length > 0;

    return rawNodes.map((n) => {
      // 1. Guardrail para Gold Marts:
      // Si aún no se ha generado una capa Gold real para esta sesión, el nodo permanece estrictamente en STANDBY (0 filas)
      if (n.id === 'gold_marts') {
        if (!hasGold) {
          return {
            ...n,
            data: {
              ...n.data,
              status: 'STANDBY' as const,
              recordsIn: 0,
              recordsOut: 0,
              catalogTable: 'gold.personalizado',
              label: 'Gold Marts (Por Definir)',
              description:
                'Marts y vistas analíticas personalizables. Interactúa con el Copiloto para crear tu capa Gold.',
            },
          };
        }

        const meta = activeSession?.metadata as Record<string, any> | undefined;
        const totalGoldRecords =
          (meta?.records_count as number) ||
          (meta?.total_records as number) ||
          (meta?.gold_count as number) ||
          (n.data.recordsOut && n.data.recordsOut > 0 ? n.data.recordsOut : 41);

        const cleanedIn =
          rawNodes.find((x) => x.id === 'silver_cleansing')?.data.recordsOut ||
          rawNodes.find((x) => x.data.nodeType === 'source')?.data.recordsOut ||
          9795;

        const tableLabel =
          goldTables.length === 1
            ? `Gold Mart: ${goldTables[0]}`
            : `Gold Marts (${goldTables.length} Tablas)`;

        const catalogDisplay = goldTables.join(', ');
        const storageUri =
          (meta?.spec_uri as string) ||
          `s3://midas-governance/airflow-specs/${activeSession?.session_id || ''}/`;

        return {
          ...n,
          data: {
            ...n.data,
            status: 'HEALTHY' as const,
            label: tableLabel,
            catalogTable: catalogDisplay,
            storagePath: storageUri,
            recordsIn: cleanedIn,
            recordsOut: totalGoldRecords,
            description:
              goldTables.length > 1
                ? `Data Marts certificados en Iceberg: ${catalogDisplay}.`
                : `Data Mart ${goldTables[0]} certificado en Iceberg.`,
            details: {
              ...n.data.details,
              tables: goldTables,
              tables_count: goldTables.length,
              pipeline_id:
                meta?.pipeline_id ||
                (goldTables[0] ? `dag_${goldTables[0].replace('.', '_')}` : 'pipeline_gold'),
              spec_uri: storageUri,
              audit_status: 'Certificado WAP en catálogo Iceberg',
              engine: 'Trino 450 (Iceberg REST)',
            },
          },
        };
      }

      // 2. Guardrail para Nodo Fuente:
      // Conforme a la regla de negocio: el flujo sólo se marca como completado/saludable cuando existe un mart Gold.
      // Si ya procesó filas de ingesta, pasa a IN_PROGRESS en lugar de quedarse congelado en RUNNING.
      if (n.data?.nodeType === 'source' || n.id.startsWith('source_')) {
        const hasRecords = (n.data.recordsOut ?? 0) > 0 || (n.data.recordsIn ?? 0) > 0;
        if (hasRecords) {
          return {
            ...n,
            data: {
              ...n.data,
              status: hasGold ? ('HEALTHY' as const) : ('IN_PROGRESS' as const),
            },
          };
        }
      }

      return n;
    });
  }, [activeTopology, dynamicTopology, activeSession]);

  const currentEdges = useMemo(() => {
    if (activeTopology?.edges && activeTopology.edges.length > 0) {
      return activeTopology.edges;
    }
    return dynamicTopology.edges;
  }, [activeTopology, dynamicTopology]);

  // Data-gating: verificar si hay fuentes de datos conectadas y almacenarlas
  useEffect(() => {
    const checkData = async () => {
      try {
        const conns = await listSourceConnections();
        if (Array.isArray(conns) && conns.length > 0) {
          setAvailableSources(conns);
          setHasConnectedData(true);
        } else {
          setAvailableSources([]);
          setHasConnectedData(false);
        }
      } catch {
        setAvailableSources([]);
        setHasConnectedData(false);
      }
    };
    void checkData();
  }, []);

  // HU-FRONT-07: Refrescar la lista de sesiones tras completar un turno de conversación
  // y reflejar materialización de Gold en la topología de la sesión
  useEffect(() => {
    copilotChat?.setOnTurnComplete?.(async (threadId) => {
      await fetchSessions();
      await refreshActiveSession();
      const targetId = activeSessionId || threadId;
      if (!targetId) return;
      try {
        const sess = await getSessionDetail(targetId);
        const meta = sess?.metadata as Record<string, any> | undefined;
        const goldTables: string[] = meta?.gold_tables || (meta?.gold_table ? [meta.gold_table] : []);
        if (goldTables.length > 0) {
          const recordsCount = (meta?.records_count as number) || (meta?.total_records as number) || (meta?.gold_count as number) || 41;
          const updatedNodes = currentNodes.map((n) => {
            if (n.id === 'gold_marts') {
              const cleanedIn = currentNodes.find((x) => x.id === 'silver_cleansing')?.data.recordsOut || 0;
              return {
                ...n,
                data: {
                  ...n.data,
                  label: 'Gold Marts (Materializado)',
                  status: 'HEALTHY' as const,
                  catalogTable: goldTables.join(', '),
                  storagePath: (meta?.spec_uri as string) || 's3://midas-governance/airflow-specs/',
                  recordsIn: cleanedIn,
                  recordsOut: recordsCount,
                  description: `Data Mart(s) ${goldTables.join(', ')} certificados en Iceberg vía Airflow.`,
                  details: {
                    ...n.data.details,
                    tables: goldTables,
                    pipeline_id: meta?.pipeline_id,
                    spec_uri: meta?.spec_uri,
                    audit_status: 'Certificado WAP en catálogo Iceberg',
                  },
                },
              };
            }
            if (n.data?.nodeType === 'source' || n.id.startsWith('source_')) {
              return {
                ...n,
                data: {
                  ...n.data,
                  status: 'HEALTHY' as const,
                },
              };
            }
            return n;
          });
          await saveTopology(updatedNodes, currentEdges);
        }
      } catch {
        // Fallback silencioso
      }
    });
  }, [copilotChat, fetchSessions, refreshActiveSession, activeSessionId, currentNodes, currentEdges, saveTopology]);

  // Sincronizar rol activo con el contexto del Copiloto para inyección en X-User-Role (ADR-011)
  useEffect(() => {
    const backendRoleId = activeRoleDefinition?.role_id ?? ZERO_TRUST_ROLE_IDS[selectedRole] ?? 'director_general';
    copilotChat?.setActiveRole?.(backendRoleId);
  }, [activeRoleDefinition, selectedRole, copilotChat]);
  const lastLoadedSessionIdRef = useRef<string | null>(null);

  // Restauración Integral de Contexto al seleccionar una sesión histórica (CA-04)
  useEffect(() => {
    if (!activeSession) {
      if (lastLoadedSessionIdRef.current !== null) {
        lastLoadedSessionIdRef.current = null;
        copilotChat.setConnectionId(undefined);
        copilotChat.startNewChat(availableSources.slice(0, 1));
      }
      return;
    }

    if (lastLoadedSessionIdRef.current === activeSession.session_id) {
      return;
    }

    lastLoadedSessionIdRef.current = activeSession.session_id;

    // Identificar la conexión exclusiva asociada a esta sesión (1 sesión = 1 conexión)
    const sessionConnId =
      (activeSession.metadata?.connection_id as string) ||
      activeSession.topology_state?.nodes?.find((n) => n.data?.nodeType === 'source')?.data?.connectionId ||
      currentNodes.find((n) => n.data?.nodeType === 'source')?.data?.connectionId;

    const sessionSources = sessionConnId
      ? availableSources.filter((s) => s.connection_id === sessionConnId)
      : availableSources.slice(0, 1);

    copilotChat.setConnectionId(sessionConnId);

    // Hidratación de mensajes de la sesión al Copiloto
    if (activeSession.messages && activeSession.messages.length > 0) {
      const mappedMessages: CopilotMessage[] = activeSession.messages.map((m) => ({
        id: m.id,
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.content,
        timestamp: m.created_at,
        intent: m.metadata?.intent,
        suggestions: m.metadata?.suggestions as string[] | undefined,
        echartsOption: (m.metadata?.echarts_option as EChartsOption) || null,
        metricsSummary: m.metadata?.metrics_summary as Array<Record<string, unknown>> | undefined,
      }));

      copilotChat.loadSessionMessages(mappedMessages, activeSession.session_id, sessionSources, sessionConnId);
    } else {
      copilotChat.loadSessionMessages([], activeSession.session_id, sessionSources, sessionConnId);
    }
  }, [activeSession, copilotChat, availableSources, currentNodes]);

  // Manejo de envío de prompt desde la pantalla de bienvenida (ChatGPT-Style)
  const handleWelcomeSendPrompt = async (promptText: string) => {
    try {
      let currentSessionId = activeSessionId;
      if (!currentSessionId) {
        // Título preliminar tomado del prompt
        const sessionTitle = promptText.length > 45 ? `${promptText.slice(0, 42)}...` : promptText;
        currentSessionId = await createAndSelectSession(sessionTitle);
      }

      setWorkspaceMode('active');
      copilotChat.setThreadId(currentSessionId);
      copilotChat.openDrawer();
      await copilotChat.send(promptText);
    } catch (err) {
      console.error('Error al procesar prompt de bienvenida:', err);
    }
  };

  const handleQuickConnectSuccess = () => {
    setHasConnectedData(true);
    setWorkspaceMode('active');
    copilotChat.openDrawer();
  };

  const isNewChatView = workspaceMode === 'welcome' && !activeSessionId;
  const showCanvas = hasConnectedData && !(workspaceMode === 'welcome' && !activeSessionId);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#FFFFFF] text-[#1C1E21] antialiased overflow-hidden">
      {/* 1. Header Ejecutivo Corporativo — Geometría Clásica & Precisión Técnica */}
      <header className="flex h-13 w-full shrink-0 items-center justify-between border-b border-[#E8E4DC] bg-[#FFFFFF] px-4 py-2.5 shadow-[0_1px_3px_rgba(40,30,10,0.03)] z-40 relative">
        {/* Marca */}
        <div className="flex items-center space-x-3.5">
          <div className="w-7 h-7 rounded-md bg-[#FBF8EF] border border-[#D4AF37] flex items-center justify-center text-[#B8860B] shadow-sm">
            <span className="font-serif font-bold text-xs tracking-wider">M</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-serif font-semibold text-xs tracking-wider text-[#1C1E21]">MIDAS</span>
            <span className="text-[10px] font-mono text-[#787164] tracking-tight border-l border-[#E8E4DC] pl-2.5">
              Active Lakehouse
            </span>
          </div>
        </div>

        {/* Selector de Vista Principal: Pipeline Canvas vs Centro de Analítica (Solo visible con datos conectados y sesión activa) */}
        {hasConnectedData && !isNewChatView && (
          <div className="flex items-center rounded-lg border border-[#E8E4DC] bg-[#F7F7F5] p-0.5 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveMainView('canvas')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                activeMainView === 'canvas'
                  ? 'bg-white text-[#1C1E21] shadow-2xs border border-[#E8E4DC]'
                  : 'text-[#787164] hover:text-[#1C1E21]'
              }`}
            >
              <Layers className="h-3.5 w-3.5 text-[#B8860B]" />
              Pipeline Lakehouse
            </button>
            <button
              type="button"
              onClick={() => setActiveMainView('analytics')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                activeMainView === 'analytics'
                  ? 'bg-white text-[#1C1E21] shadow-2xs border border-[#E8E4DC]'
                  : 'text-[#787164] hover:text-[#1C1E21]'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5 text-[#2563EB]" />
              Analítica de Datos
            </button>
          </div>
        )}

        {/* Frontera HU-FRONT-05: Selector Zero-Trust Roles */}
        <ZeroTrustLens
          role={selectedRole}
          onRoleChange={setSelectedRole}
          roleDefinition={activeRoleDefinition}
        />
      </header>

      {/* 2. Cuerpo Principal con Layout Dividido: Sidebar + Workspace (Modo 1 vs Modo 2) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Panel Lateral de Historial de Sesiones */}
        <SessionHistorySidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />

        {/* Área Central: Transición Dinámica de Estados */}
        <main className="relative flex flex-1 overflow-hidden bg-[#FFFFFF]">
          {isNewChatView ? (
            /* Modo 1: Welcome Hub (ChatGPT-Style) */
            <section
              aria-label="Pantalla de Bienvenida y Lanzadores de Ingesta"
              className="relative flex-1 h-full w-full overflow-y-auto"
            >
              <WelcomeHero
                securityRole={selectedRole}
                hasConnectedData={hasConnectedData}
                connectedSourceName={(activeSession?.metadata?.connection_id as string) || undefined}
                onSendPrompt={handleWelcomeSendPrompt}
                onQuickConnectSuccess={handleQuickConnectSuccess}
              />
            </section>
          ) : (
            /* Modo 2: Active Canvas & Copilot Workspace */
            <section
              aria-label="Topología del Pipeline Lakehouse y Espacio Activo"
              className="relative flex-1 h-full bg-[#FFFFFF]"
            >
              {!hasConnectedData ? (
                <div className="flex h-full w-full items-center justify-center bg-[#FFFFFF] text-[#4B4639] font-mono text-sm">
                  <div className="text-center space-y-3">
                    <p className="text-lg font-semibold">Conecta tus datos primero</p>
                    <p className="text-xs text-[#A0988A]">Registra una fuente de datos para habilitar el chat y la topologia.</p>
                  </div>
                </div>
              ) : activeMainView === 'analytics' ? (
                <SessionAnalyticsView
                  sessionId={activeSessionId || 'default'}
                  activeNodes={currentNodes}
                  onRefreshTopology={refreshActiveSession}
                />
              ) : (
                <PipelineCanvas
                  securityRole={selectedRole}
                  securityPolicy={securityPolicy}
                  initialNodes={currentNodes}
                  initialEdges={currentEdges}
                  onTopologyChange={activeSessionId ? saveTopology : undefined}
                />
              )}
            </section>
          )}
        </main>
      </div>

      {/* Frontera HU-FRONT-04: Widget flotante + Drawer expandible del Copiloto */}
      {!isNewChatView && hasConnectedData && <CopilotChatWidget />}
      <CopilotChatDrawer />

      {/* Frontera HU-FRONT-06: Drawer de linaje "Explícame esta cifra" */}
      <ExplainNumberDrawer />
    </div>
  );
}

export default function MidasConsolePage() {
  return (
    <SessionProvider>
      <ExplainNumberProvider>
        <CopilotChatProvider>
          <MidasConsoleWorkspace />
        </CopilotChatProvider>
      </ExplainNumberProvider>
    </SessionProvider>
  );
}
