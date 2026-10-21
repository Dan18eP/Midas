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
import { PanelLeft } from 'lucide-react';
import {
  CopilotChatDrawer,
  CopilotChatProvider,
  CopilotChatWidget,
  useCopilotChatContext,
} from '@/components/copilot';
import type { CopilotMessage, EChartsOption } from '@/components/copilot/types';
import { ExplainNumberDrawer, ExplainNumberProvider } from '@/components/lineage';
import {
  ZERO_TRUST_ROLE_IDS,
  buildSecurityNodePolicy,
  type ZeroTrustRole,
} from '@/components/security/ZeroTrustLens';
import { fetchSecurityRoles, type SecurityRoleDefinition } from '@/services/securityRolesApi';
import { useTelemetryHistory } from '@/hooks/useTelemetryHistory';
import { SessionProvider, useSession } from '@/context/SessionContext';
import { SessionHistorySidebar } from '@/components/workspace/SessionHistorySidebar';
import { WelcomeHero } from '@/components/workspace/WelcomeHero';
import { INITIAL_CANVAS_NODES, INITIAL_CANVAS_EDGES } from '@/components/canvas/topology/initialTopology';

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

  // HU-FRONT-08: las identidades reales provienen del catálogo del backend.
  const [roleDefinitions, setRoleDefinitions] = useState<SecurityRoleDefinition[]>([]);

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
  } = useSession();

  const copilotChat = useCopilotChatContext();
  const lastLoadedSessionIdRef = useRef<string | null>(null);

  // Restauración Integral de Contexto al seleccionar una sesión histórica (CA-04)
  useEffect(() => {
    if (!activeSession) {
      if (lastLoadedSessionIdRef.current !== null) {
        lastLoadedSessionIdRef.current = null;
        copilotChat.startNewChat();
      }
      return;
    }

    if (lastLoadedSessionIdRef.current === activeSession.session_id) {
      return;
    }

    lastLoadedSessionIdRef.current = activeSession.session_id;

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

      copilotChat.loadSessionMessages(mappedMessages, activeSession.session_id);
    } else {
      copilotChat.loadSessionMessages([], activeSession.session_id);
    }
  }, [activeSession, copilotChat]);

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
    setWorkspaceMode('active');
    copilotChat.openDrawer();
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-[#FFFFFF] text-[#1C1E21] antialiased overflow-hidden">
      {/* 1. Header Ejecutivo Corporativo — Geometría Clásica & Precisión Técnica */}
      <header className="flex h-13 w-full shrink-0 items-center justify-between border-b border-[#E8E4DC] bg-[#FFFFFF] px-4 py-2.5 shadow-[0_1px_3px_rgba(40,30,10,0.03)] z-40 relative">
        {/* Toggle Sidebar & Marca */}
        <div className="flex items-center space-x-3.5">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label="Alternar barra lateral de sesiones"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E4DC] text-[#787164] hover:bg-[#FBF8EF] hover:text-[#1C1E21] transition-colors"
            title="Alternar barra de sesiones"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

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

        {/* Frontera HU-FRONT-03: Time-Travel Replay Status */}
        <div className="hidden lg:flex items-center bg-[#F7F7F5] border border-[#E8E4DC] rounded-md px-2.5 py-1 text-xs shadow-inner gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[#787164] font-mono font-medium">Time-Travel Replay:</span>
          <span className="flex items-center space-x-1.5 px-2 py-1 rounded bg-[#FFFFFF] text-[#1C1E21] font-medium border border-[#D4AF37]/40 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C0F] animate-pulse" />
            <span className="font-mono text-[10px] font-semibold text-[#8C6D1F]">Historial del Gateway de Telemetría</span>
          </span>
        </div>

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
          {workspaceMode === 'welcome' && !activeSessionId ? (
            /* Modo 1: Welcome Hub (ChatGPT-Style) */
            <section
              aria-label="Pantalla de Bienvenida y Lanzadores de Ingesta"
              className="relative flex-1 h-full w-full overflow-y-auto"
            >
              <WelcomeHero
                securityRole={selectedRole}
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
              <PipelineCanvas
                securityRole={selectedRole}
                securityPolicy={securityPolicy}
                initialNodes={activeTopology?.nodes || INITIAL_CANVAS_NODES}
                initialEdges={activeTopology?.edges || INITIAL_CANVAS_EDGES}
              />

              {/* Frontera HU-FRONT-05: Overlay Tarjeta Flotante PII Preview */}
              <div className="pointer-events-auto absolute bottom-20 left-4 z-20">
                <ZeroTrustLens
                  role={selectedRole}
                  preview
                  roleDefinition={activeRoleDefinition}
                />
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Frontera HU-FRONT-04: Widget flotante + Drawer expandible del Copiloto */}
      <CopilotChatWidget />
      <CopilotChatDrawer />

      {/* Frontera HU-FRONT-06: Drawer de linaje "Explícame esta cifra" */}
      <ExplainNumberDrawer />
    </div>
  );
}

function AuthenticatedConsole() {
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

export default function MidasConsolePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    void fetch(`${api}/api/v1/auth/me`, { credentials: 'include' })
      .then((response) => setAuthenticated(response.ok)).catch(() => setAuthenticated(false));
  }, [api]);

  if (authenticated) return <AuthenticatedConsole />;
  return (
    <main className="flex min-h-screen items-center justify-center bg-white text-stone-900">
      <form className="flex w-80 flex-col gap-4" onSubmit={async (event) => {
        event.preventDefault();
        try {
          const response = await fetch(`${api}/api/v1/auth/login`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          if (!response.ok) throw new Error('Sign-in failed');
          setToken('');
          setAuthenticated(true);
        } catch { setError('Could not sign in. Check your operator token and API.'); }
      }}>
        <h1 className="text-xl">Sign in to Midas</h1>
        <label htmlFor="operator-token">Local operator token</label>
        <input id="operator-token" className="border p-2" type="password" value={token}
          onChange={(event) => setToken(event.target.value)} required autoComplete="off" />
        <button type="submit" className="border p-2">Sign in</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}
