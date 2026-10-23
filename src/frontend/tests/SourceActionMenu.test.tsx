/**
 * Midas - Test Suite para el Menú «+» Conversacional de Fuentes de Datos
 *
 * Valida la apertura/cierre del menú «+», navegación por teclado,
 * selección de las 4 fuentes (CSV, Base de Datos, REST, Excel),
 * integración con PromptComposer y ausencia de controles duplicados en el Header.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceActionMenu, SOURCE_OPTIONS } from '../components/copilot/SourceActionMenu';
import { PromptComposer } from '../components/copilot/PromptComposer';
import MidasConsolePage from '../app/page';
import { SessionProvider } from '../context/SessionContext';

// Mock de fetch global
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Menú «+» Conversacional de Fuentes de Datos (SourceActionMenu)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
  });

  describe('1. Renderizado y Estados del Menú «+»', () => {
    it('renderiza el botón «+» con atributos de accesibilidad iniciales', () => {
      render(<SourceActionMenu onSelect={vi.fn()} />);

      const trigger = screen.getByRole('button', { name: /Añadir fuentes de datos/i });
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('abre el menú al hacer clic en el botón «+» y muestra las 4 opciones requeridas', () => {
      render(<SourceActionMenu onSelect={vi.fn()} />);

      const trigger = screen.getByRole('button', { name: /Añadir fuentes de datos/i });
      fireEvent.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const menu = screen.getByRole('menu', { name: /Fuentes de datos disponibles/i });
      expect(menu).toBeInTheDocument();

      // Validación de las 4 opciones especificadas
      expect(screen.getByText('Añadir archivo CSV')).toBeInTheDocument();
      expect(screen.getByText('Importar datos delimitados')).toBeInTheDocument();

      expect(screen.getByText('Conectar base de datos')).toBeInTheDocument();
      expect(screen.getByText('Configurar una fuente SQL')).toBeInTheDocument();

      expect(screen.getByText('Conectar API REST')).toBeInTheDocument();
      expect(screen.getByText('Configurar un endpoint externo')).toBeInTheDocument();

      expect(screen.getByText('Añadir archivo Excel')).toBeInTheDocument();
      expect(screen.getByText('Importar hojas de cálculo')).toBeInTheDocument();
    });

    it('vuelve a cerrar el menú al presionar nuevamente el botón «+»', () => {
      render(<SourceActionMenu onSelect={vi.fn()} />);

      const trigger = screen.getByRole('button', { name: /Añadir fuentes de datos/i });
      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('cierra el menú al presionar la tecla Escape', () => {
      render(<SourceActionMenu onSelect={vi.fn()} />);

      const trigger = screen.getByRole('button', { name: /Añadir fuentes de datos/i });
      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('cierra el menú al hacer clic fuera del componente', () => {
      render(
        <div>
          <div data-testid="outside-element">Exterior</div>
          <SourceActionMenu onSelect={vi.fn()} />
        </div>
      );

      const trigger = screen.getByRole('button', { name: /Añadir fuentes de datos/i });
      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId('outside-element'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('no abre el menú cuando está deshabilitado', () => {
      render(<SourceActionMenu onSelect={vi.fn()} disabled={true} />);

      const trigger = screen.getByRole('button', { name: /Añadir fuentes de datos/i });
      expect(trigger).toBeDisabled();
      fireEvent.click(trigger);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('2. Disparo de Acciones y Selección de Fuentes', () => {
    it('dispara onSelect con tipo "csv" al seleccionar la opción CSV', () => {
      const handleSelect = vi.fn();
      render(<SourceActionMenu onSelect={handleSelect} />);

      fireEvent.click(screen.getByRole('button', { name: /Añadir fuentes de datos/i }));
      fireEvent.click(screen.getByTestId('source-option-csv'));

      expect(handleSelect).toHaveBeenCalledWith('csv');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('dispara onSelect con tipo "database" al seleccionar Base de Datos', () => {
      const handleSelect = vi.fn();
      render(<SourceActionMenu onSelect={handleSelect} />);

      fireEvent.click(screen.getByRole('button', { name: /Añadir fuentes de datos/i }));
      fireEvent.click(screen.getByTestId('source-option-database'));

      expect(handleSelect).toHaveBeenCalledWith('database');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('dispara onSelect con tipo "rest" al seleccionar API REST', () => {
      const handleSelect = vi.fn();
      render(<SourceActionMenu onSelect={handleSelect} />);

      fireEvent.click(screen.getByRole('button', { name: /Añadir fuentes de datos/i }));
      fireEvent.click(screen.getByTestId('source-option-rest'));

      expect(handleSelect).toHaveBeenCalledWith('rest');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('dispara onSelect con tipo "excel" al seleccionar Excel', () => {
      const handleSelect = vi.fn();
      render(<SourceActionMenu onSelect={handleSelect} />);

      fireEvent.click(screen.getByRole('button', { name: /Añadir fuentes de datos/i }));
      fireEvent.click(screen.getByTestId('source-option-excel'));

      expect(handleSelect).toHaveBeenCalledWith('excel');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('3. Navegación Accesible por Teclado', () => {
    it('soporta navegación con flechas abajo y arriba', () => {
      render(<SourceActionMenu onSelect={vi.fn()} />);

      const trigger = screen.getByRole('button', { name: /Añadir fuentes de datos/i });
      fireEvent.click(trigger);

      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();

      // Flecha abajo -> primer ítem
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      const csvOption = screen.getByTestId('source-option-csv');
      expect(document.activeElement).toBe(csvOption);

      // Flecha abajo -> segundo ítem (database)
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      const dbOption = screen.getByTestId('source-option-database');
      expect(document.activeElement).toBe(dbOption);

      // Flecha arriba -> regresa a CSV
      fireEvent.keyDown(window, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(csvOption);

      // Tecla End -> salta al último ítem (excel)
      fireEvent.keyDown(window, { key: 'End' });
      const excelOption = screen.getByTestId('source-option-excel');
      expect(document.activeElement).toBe(excelOption);

      // Tecla Home -> salta al primer ítem (csv)
      fireEvent.keyDown(window, { key: 'Home' });
      expect(document.activeElement).toBe(csvOption);
    });
  });

  describe('4. Integración en PromptComposer', () => {
    it('abre el modal de conexión rápida al seleccionar una fuente desde el compositor', async () => {
      render(
        <SessionProvider>
          <PromptComposer
            onSubmit={vi.fn()}
            suggestions={[]}
            status="idle"
          />
        </SessionProvider>
      );

      // Clic en el botón "+" dentro del compositor
      const plusTrigger = screen.getByTestId('source-action-menu-trigger');
      fireEvent.click(plusTrigger);

      // Clic en la opción "Conectar base de datos"
      const dbOption = screen.getByTestId('source-option-database');
      fireEvent.click(dbOption);

      // Se debe abrir QuickConnectionModal configurado en Base de Datos
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/Conectar Base de Datos Relacional/i)).toBeInTheDocument();
        expect(screen.getByText(/Motor de Base de Datos/i)).toBeInTheDocument();
      });

      // El modal se cierra correctamente
      const closeBtn = screen.getByRole('button', { name: /Cerrar modal/i });
      fireEvent.click(closeBtn);
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('abre el modal en la pestaña CSV al seleccionar "Añadir archivo CSV"', async () => {
      render(
        <SessionProvider>
          <PromptComposer
            onSubmit={vi.fn()}
            suggestions={[]}
            status="idle"
          />
        </SessionProvider>
      );

      const plusTrigger = screen.getByTestId('source-action-menu-trigger');
      fireEvent.click(plusTrigger);

      const csvOption = screen.getByTestId('source-option-csv');
      fireEvent.click(csvOption);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/Conectar Archivo CSV Delimitado/i)).toBeInTheDocument();
      });
    });
  });

  describe('5. Verificación de Despliegue Único del Historial (Criterio #2)', () => {
    it('confirma que NO existe botón de colapsado ni badge de Time-Travel Replay en el Header y el colapsado solo existe en el Sidebar', () => {
      render(<MidasConsolePage />);

      // En el header solo deben existir Marca y Zero-Trust (sin Time-Travel Replay — Historial del Gateway de Telemetría)
      expect(screen.queryByRole('button', { name: /Alternar barra lateral de sesiones/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/Historial del Gateway de Telemetría/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Time-Travel Replay:/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('zero-trust-role-selector')).toBeInTheDocument();

      // En el sidebar sí existe el botón de colapsar
      const sidebarCollapseBtn = screen.getByRole('button', { name: /Colapsar historial/i });
      expect(sidebarCollapseBtn).toBeInTheDocument();

      // Colapsar el sidebar y verificar botón de expansión
      fireEvent.click(sidebarCollapseBtn);
      expect(screen.getByRole('button', { name: /Expandir historial de sesiones/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Alternar barra lateral de sesiones/i })).not.toBeInTheDocument();
    });
  });
});
