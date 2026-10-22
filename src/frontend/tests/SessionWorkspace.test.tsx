/**
 * Midas - Test Suite para HU-FRONT-07 & ADR-010.
 *
 * Workspace Conversacional Multi-Sesión estilo ChatGPT,
 * Conexiones Rápidas de Ingesta y Navegación de Sesiones.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WelcomeHero } from '../components/workspace/WelcomeHero';
import { QuickConnectionModal } from '../components/workspace/QuickConnectionModal';
import { SessionHistorySidebar } from '../components/workspace/SessionHistorySidebar';
import { SessionProvider, useSession } from '../context/SessionContext';
import type { ChatSessionSummary, ChatSessionDetail } from '../types/session';

// Mock de fetch global para sessionService
const mockFetch = vi.fn();
global.fetch = mockFetch;

const now = new Date();
const todayISO = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0).toISOString();
const yesterdayISO = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10, 0, 0).toISOString();

const MOCK_SESSIONS: ChatSessionSummary[] = [
  {
    session_id: 'session_today_1',
    user_id: 'user_director',
    title: 'Análisis de cumplimiento presupuestal 2026',
    message_count: 4,
    created_at: todayISO,
    updated_at: todayISO,
    metadata: { active_modules: ['audit', 'pipeline', 'mart_gold'] },
  },
  {
    session_id: 'session_yesterday_1',
    user_id: 'user_director',
    title: 'Exploración de clientes CRM',
    message_count: 2,
    created_at: yesterdayISO,
    updated_at: yesterdayISO,
    metadata: { active_modules: ['pipeline'] },
  },
];

const MOCK_SESSION_DETAIL: ChatSessionDetail = {
  session_id: 'session_today_1',
  user_id: 'user_director',
  title: 'Análisis de cumplimiento presupuestal 2026',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  metadata: { active_modules: ['audit', 'pipeline'] },
  topology_state: {
    nodes: [],
    edges: [],
  },
  messages: [
    {
      id: 'msg_1',
      session_id: 'session_today_1',
      sender: 'user',
      content: 'Dame el balance de cobranza de Q1',
      created_at: new Date().toISOString(),
    },
    {
      id: 'msg_2',
      session_id: 'session_today_1',
      sender: 'assistant',
      content: 'El balance consolidado asciende a 1.2M USD con 98% de cumplimiento.',
      created_at: new Date().toISOString(),
    },
  ],
};

describe('HU-FRONT-07 — Workspace Conversacional Multi-Sesión & Welcome Hub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/sessions') && options?.method === 'GET' && !urlStr.includes('session_')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSIONS),
        });
      }
      if (urlStr.includes('/api/v1/sessions/session_today_1') && options?.method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(MOCK_SESSION_DETAIL),
        });
      }
      if (urlStr.includes('/api/v1/connections/test')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            success: true,
            latency_ms: 18.5,
            detail: 'HTTP 200 - Servicio accesible',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    });
  });

  describe('1. WelcomeHero — Pantalla de Bienvenida y Lanzadores de Ingesta', () => {
    it('renderiza el saludo empático dinámico basado en Zero-Trust Lens (Director General)', () => {
      render(<WelcomeHero securityRole="admin" onSendPrompt={vi.fn()} />);

      expect(
        screen.getByRole('heading', { name: /Hola, Director General\. ¿Qué tienes en mente hoy\?/i })
      ).toBeInTheDocument();
      expect(screen.queryByText(/Zero-Trust Lens/i)).not.toBeInTheDocument();
    });

    it('renderiza el saludo adaptado para rol RBAC (Gerente Regional Norte)', () => {
      render(<WelcomeHero securityRole="rbac" onSendPrompt={vi.fn()} />);

      expect(
        screen.getByRole('heading', { name: /Hola, Gerente Regional Norte\. ¿Qué tienes en mente hoy\?/i })
      ).toBeInTheDocument();
    });

    it('muestra las cuatro opciones de conexión rápida (CSV, Base de Datos, REST, Excel) a través del menú «+»', () => {
      render(<WelcomeHero securityRole="admin" onSendPrompt={vi.fn()} />);

      const plusBtn = screen.getByTestId('source-action-menu-trigger');
      expect(plusBtn).toBeInTheDocument();
      fireEvent.click(plusBtn);

      expect(screen.getByText('Añadir archivo CSV')).toBeInTheDocument();
      expect(screen.getByText('Conectar base de datos')).toBeInTheDocument();
      expect(screen.getByText('Conectar API REST')).toBeInTheDocument();
      expect(screen.getByText('Añadir archivo Excel')).toBeInTheDocument();
    });

    it('envía el prompt cuando el usuario escribe en la barra central', () => {
      const handleSend = vi.fn();
      render(<WelcomeHero securityRole="admin" onSendPrompt={handleSend} />);

      const input = screen.getByPlaceholderText(/¿Qué analizamos hoy\?/i);
      fireEvent.change(input, { target: { value: 'Inspeccionar anomalías de duplicados' } });

      const submitButton = screen.getByRole('button', { name: /Enviar prompt/i });
      fireEvent.click(submitButton);

      expect(handleSend).toHaveBeenCalledWith('Inspeccionar anomalías de duplicados');
    });

    it('permite hacer clic en las sugerencias predefinidas', () => {
      const handleSend = vi.fn();
      render(<WelcomeHero securityRole="admin" onSendPrompt={handleSend} />);

      const suggestion = screen.getByText('Explorar tablas de CRM');
      fireEvent.click(suggestion);

      expect(handleSend).toHaveBeenCalledWith('Explorar tablas de CRM');
    });

    it('abre el modal de conexión rápida al pulsar una opción del menú «+»', () => {
      render(
        <SessionProvider>
          <WelcomeHero securityRole="admin" onSendPrompt={vi.fn()} />
        </SessionProvider>
      );

      const plusBtn = screen.getByTestId('source-action-menu-trigger');
      fireEvent.click(plusBtn);

      const excelOption = screen.getByTestId('source-option-excel');
      fireEvent.click(excelOption);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Cargar Hoja de Cálculo Excel/i)).toBeInTheDocument();
    });
  });

  describe('2. QuickConnectionModal — Modal de Conexión de Fuentes', () => {
    it('cierra el modal al presionar el botón de cerrar', () => {
      const handleClose = vi.fn();
      render(
        <SessionProvider>
          <QuickConnectionModal isOpen={true} initialType="excel" onClose={handleClose} />
        </SessionProvider>
      );

      const closeButton = screen.getByRole('button', { name: /Cerrar modal/i });
      fireEvent.click(closeButton);

      expect(handleClose).toHaveBeenCalled();
    });

    it('cierra el modal al pulsar la tecla Escape', () => {
      const handleClose = vi.fn();
      render(
        <SessionProvider>
          <QuickConnectionModal isOpen={true} initialType="csv" onClose={handleClose} />
        </SessionProvider>
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalled();
    });

    it('permite alternar pestañas entre Excel, CSV, API REST y Base de Datos', () => {
      render(
        <SessionProvider>
          <QuickConnectionModal isOpen={true} initialType="excel" onClose={vi.fn()} />
        </SessionProvider>
      );

      const restTab = screen.getByRole('button', { name: /API REST/i });
      fireEvent.click(restTab);

      expect(screen.getByText(/URL del Endpoint/i)).toBeInTheDocument();

      const dbTab = screen.getByRole('button', { name: /Base de Datos/i });
      fireEvent.click(dbTab);

      expect(screen.getByText(/Motor de Base de Datos/i)).toBeInTheDocument();
    });

    it('ejecuta la prueba de conexión y limpia el resultado al cambiar de pestaña', async () => {
      render(
        <SessionProvider>
          <QuickConnectionModal isOpen={true} initialType="rest" onClose={vi.fn()} />
        </SessionProvider>
      );

      const urlInput = screen.getByPlaceholderText('https://api.empresa.com/v1/tickets');
      fireEvent.change(urlInput, { target: { value: 'https://api.empresa.com/v1/tickets' } });

      const testBtn = screen.getByRole('button', { name: /Probar Conexión/i });
      fireEvent.click(testBtn);

      await waitFor(() => {
        expect(screen.getByText(/Diagnóstico Pre-flight Exitoso/i)).toBeInTheDocument();
        expect(screen.getByText(/18.5 ms/i)).toBeInTheDocument();
      });

      // Al alternar a otra pestaña, el diagnóstico se limpia de inmediato
      const dbTab = screen.getByRole('button', { name: /Base de Datos/i });
      fireEvent.click(dbTab);

      expect(screen.queryByText(/Diagnóstico Pre-flight Exitoso/i)).not.toBeInTheDocument();
    });
  });

  describe('3. SessionHistorySidebar — Panel Lateral de Historial y Navegación', () => {
    it('renderiza los grupos cronológicos Hoy y Ayer con sus títulos e insignias', async () => {
      render(
        <SessionProvider>
          <SessionHistorySidebar />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Hoy')).toBeInTheDocument();
        // 'Ayer' puede aparecer dos veces: como etiqueta del grupo cronológico y
        // como tiempo relativo de una sesión actualizada ayer (>24h transcurridas).
        // La aserción valida la existencia del grupo sin depender de la hora de ejecución.
        expect(screen.getAllByText('Ayer').length).toBeGreaterThanOrEqual(1);
      });

      expect(
        screen.getByText('Análisis de cumplimiento presupuestal 2026')
      ).toBeInTheDocument();
      expect(screen.getByText('Exploración de clientes CRM')).toBeInTheDocument();
      expect(screen.getByText('Auditoría')).toBeInTheDocument();
      expect(screen.getAllByText('Flujo').length).toBeGreaterThanOrEqual(1);
    });

    it('dispara la selección de sesión al hacer clic en un elemento del historial', async () => {
      function TestHost() {
        const { activeSessionId } = useSession();
        return (
          <div>
            <div data-testid="active-session-indicator">{activeSessionId || 'ninguna'}</div>
            <SessionHistorySidebar />
          </div>
        );
      }

      render(
        <SessionProvider>
          <TestHost />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Análisis de cumplimiento presupuestal 2026')).toBeInTheDocument();
      });

      const sessionCard = screen.getByText('Análisis de cumplimiento presupuestal 2026');
      fireEvent.click(sessionCard);

      await waitFor(() => {
        expect(screen.getByTestId('active-session-indicator')).toHaveTextContent('session_today_1');
      });
    });

    it('permite reiniciar el workspace con el botón Nueva Sesión', async () => {
      function TestHost() {
        const { activeSessionId, workspaceMode } = useSession();
        return (
          <div>
            <div data-testid="mode-indicator">{workspaceMode}</div>
            <div data-testid="id-indicator">{activeSessionId || 'vacio'}</div>
            <SessionHistorySidebar />
          </div>
        );
      }

      render(
        <SessionProvider>
          <TestHost />
        </SessionProvider>
      );

      const newSessionBtn = screen.getByRole('button', { name: /Nueva Sesión/i });
      fireEvent.click(newSessionBtn);

      expect(screen.getByTestId('mode-indicator')).toHaveTextContent('welcome');
      expect(screen.getByTestId('id-indicator')).toHaveTextContent('vacio');
    });

    it('soporta colapsado y expansión de la barra lateral', () => {
      const { rerender } = render(
        <SessionProvider>
          <SessionHistorySidebar collapsed={false} />
        </SessionProvider>
      );

      expect(screen.getByRole('complementary', { name: /Historial de Sesiones Conversacionales/i })).toBeInTheDocument();

      rerender(
        <SessionProvider>
          <SessionHistorySidebar collapsed={true} />
        </SessionProvider>
      );

      expect(screen.getByRole('complementary', { name: /Barra de Sesiones Colapsada/i })).toBeInTheDocument();
    });

    it('abre el modal de confirmación al presionar eliminar sesión y se cancela correctamente', async () => {
      render(
        <SessionProvider>
          <SessionHistorySidebar />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Análisis de cumplimiento presupuestal 2026')).toBeInTheDocument();
      });

      const deleteBtn = screen.getByLabelText(/Eliminar sesión Análisis de cumplimiento presupuestal 2026/i);
      fireEvent.click(deleteBtn);

      expect(screen.getByRole('dialog', { name: /¿Eliminar sesión\?/i })).toBeInTheDocument();
      expect(screen.getByText(/Esta acción no se puede deshacer/i)).toBeInTheDocument();

      const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
      fireEvent.click(cancelBtn);

      expect(screen.queryByRole('dialog', { name: /¿Eliminar sesión\?/i })).not.toBeInTheDocument();
    });

    it('elimina la sesión cuando se confirma desde el modal de eliminación', async () => {
      render(
        <SessionProvider>
          <SessionHistorySidebar />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Análisis de cumplimiento presupuestal 2026')).toBeInTheDocument();
      });

      const deleteBtn = screen.getByLabelText(/Eliminar sesión Análisis de cumplimiento presupuestal 2026/i);
      fireEvent.click(deleteBtn);

      const confirmBtn = screen.getByRole('button', { name: /Confirmar eliminación de sesión/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /¿Eliminar sesión\?/i })).not.toBeInTheDocument();
      });
    });
  });
});
