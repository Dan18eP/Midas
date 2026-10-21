import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CopilotChatDrawer, CopilotChatProvider, CopilotChatWidget } from '../components/copilot';
import { ExplainNumberDrawer, ExplainNumberProvider } from '../components/lineage';
import { parseFigureValue, extractFigureTokens } from '../components/lineage/parseFigure';
import {
  deriveAuditHash,
  formatRelativeFreshness,
  mapGatewayStage,
  resolveNumberLineage,
} from '../components/lineage/resolveLineage';
import { fetchTableLineage } from '../components/lineage/lineageApi';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

const LINEAGE_RESPONSE = {
  thread_id: 'session_lineage_01',
  intent: 'analytics',
  response: [
    'Los ingresos netos crecieron 12.4% y alcanzaron 1.490 USD frente al trimestre anterior.',
    'El ticket promedio se mantuvo estable.',
  ].join('\n'),
  suggestions: ['Auditar el linaje de la tabla Gold'],
  needs_clarification: false,
  echarts_option: null,
  metrics_summary: [
    { label: 'Ingresos netos', value: 1490, unit: 'USD', description: 'Venta neta certificada del mart Gold.' },
    { label: 'Variación', value: '12.4%' },
  ],
};

const GATEWAY_LINEAGE_PAYLOAD = {
  table: 'gold.fact_ventas',
  transformation: "Agregación de silver.pedidos con filtro estado = 'ENTREGADO'.",
  stages: [
    {
      layer: 'source',
      table: 'public.pedidos_crm',
      location: 'midas-postgres:5432/midas_operational',
      description: 'PostgreSQL operacional ingerido por Universal Ingestion Engine.',
    },
    {
      layer: 'bronze',
      table: 'bronze.pedidos_raw',
      location: 's3://midas-bronze/pedidos_raw/',
      description: 'Iceberg v2 Parquet append-only.',
    },
    {
      layer: 'silver',
      table: 'silver.pedidos',
      location: 's3://midas-silver/pedidos/',
      description: 'Quality Gate aprobado y cuarentena activa.',
    },
    {
      layer: 'gold',
      table: 'gold.fact_ventas',
      location: 's3://midas-gold/fact_ventas/',
      description: 'Mart dimensional con promoción WAP verificada.',
    },
  ],
  certification: {
    quality_percent: 100,
    quality_summary: 'Contratos OpenMetadata vigentes',
    last_sync: '2026-10-20T14:02:00.000Z',
    audit_hash: 'a1b2c3d4e5f60718',
  },
};

function routeFetch(url: string) {
  if (String(url).includes('/api/v1/lineage/table/')) return jsonResponse(GATEWAY_LINEAGE_PAYLOAD);
  return jsonResponse(LINEAGE_RESPONSE);
}

function renderConsole() {
  return render(
    <ExplainNumberProvider>
      <CopilotChatProvider>
        <CopilotChatWidget />
        <CopilotChatDrawer />
        <ExplainNumberDrawer />
      </CopilotChatProvider>
    </ExplainNumberProvider>,
  );
}

function openDrawer() {
  fireEvent.click(screen.getByTestId('copilot-widget'));
  return screen.getByTestId('copilot-drawer');
}

function ask(text: string) {
  const input = screen.getByTestId('copilot-input');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByTestId('copilot-send-button'));
}

async function askAndWaitAssistant(text: string) {
  renderConsole();
  openDrawer();
  ask(text);
  await waitFor(() => {
    expect(screen.getAllByTestId('chat-message-assistant').length).toBe(2);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('Cifras clicables en los mensajes del Copiloto (ST-FRONT-06.1)', () => {
  it('1. Renderiza las cifras de la narrativa como botones interactivos con hover sutil', async () => {
    fetchMock.mockImplementation((url: string) => routeFetch(url));
    await askAndWaitAssistant('Analiza los ingresos netos del trimestre');

    const figures = screen.getAllByTestId('chat-figure');
    expect(figures.length).toBeGreaterThan(0);

    const percentFigure = figures.find((node) => node.getAttribute('data-figure') === '12.4%');
    expect(percentFigure).toBeTruthy();
    expect(percentFigure).toHaveAttribute('aria-label', 'Explícame esta cifra 12.4%');
    expect(percentFigure?.className).toContain('hover:bg-amber-500/10');
    expect(percentFigure?.className).toContain('decoration-dotted');

    const userMessage = screen.getByTestId('chat-message-user');
    expect(within(userMessage).queryByTestId('chat-figure')).not.toBeInTheDocument();
  });

  it('2. Los chips de metrics_summary abren el drawer "Explícame esta cifra"', async () => {
    fetchMock.mockImplementation((url: string) => routeFetch(url));
    await askAndWaitAssistant('¿Cuáles fueron los ingresos netos?');

    const chip = screen.getAllByTestId('metrics-chip')[0];
    expect(chip).toHaveTextContent('Ingresos netos');
    expect(chip).toHaveTextContent('1.490 USD');

    chip.focus();
    fireEvent.click(chip);

    await waitFor(() => {
      expect(screen.getByTestId('explain-number-drawer')).toHaveTextContent('Explícame esta cifra');
    });
    expect(screen.getByTestId('explain-number-drawer')).toHaveTextContent('Ingresos netos');
    expect(screen.getByTestId('explain-number-drawer')).toHaveTextContent('1.490 USD');
    expect(screen.getByTestId('explain-drawer-root')).toHaveAttribute('aria-hidden', 'false');
  });
});

describe('ExplainNumberDrawer · Fórmula LaTeX, árbol de linaje y certificación (ST-FRONT-06.2)', () => {
  it('3. Muestra la fórmula canónica en LaTeX, el árbol Fuente→Bronze→Silver→Gold y la certificación', async () => {
    fetchMock.mockImplementation((url: string) => routeFetch(url));
    await askAndWaitAssistant('¿Cuáles fueron los ingresos netos?');

    fireEvent.click(screen.getAllByTestId('metrics-chip')[0]);

    await waitFor(() => {
      expect(screen.getByTestId('explain-formula-section')).toBeInTheDocument();
    });

    const formulaSection = screen.getByTestId('explain-formula-section');
    expect(within(formulaSection).getByText('Fórmula canónica aplicada')).toBeInTheDocument();
    expect(formulaSection.querySelector('.katex')).not.toBeNull();
    expect(formulaSection.textContent).toContain('Diccionario Semántico Inmutable');

    await waitFor(() => {
      expect(screen.getByTestId('lineage-mini-graph')).toBeInTheDocument();
    });
    expect(screen.getByTestId('lineage-stage-source')).toHaveTextContent('public.pedidos_crm');
    expect(screen.getByTestId('lineage-stage-bronze')).toHaveTextContent('bronze.pedidos_raw');
    expect(screen.getByTestId('lineage-stage-silver')).toHaveTextContent('silver.pedidos');
    expect(screen.getByTestId('lineage-stage-gold')).toHaveTextContent('gold.fact_ventas');

    const certification = screen.getByTestId('explain-certification-section');
    expect(within(within(certification).getByTestId('explain-quality')).getByText(/100%/)).toBeInTheDocument();
    expect(screen.getByTestId('explain-last-sync')).not.toBeEmptyDOMElement();
    expect(screen.getByTestId('explain-audit-hash')).toHaveTextContent(/^[0-9a-f]{16}$/);
  });

  it('4. Asocia una cifra de la narrativa con la métrica certificada del agente por valor', async () => {
    fetchMock.mockImplementation((url: string) => routeFetch(url));
    await askAndWaitAssistant('Analiza los ingresos netos del trimestre');

    const narrativeFigure = screen.getAllByTestId('chat-figure').find(
      (node) => node.getAttribute('data-figure') === '1.490',
    );
    expect(narrativeFigure).toBeTruthy();

    fireEvent.click(narrativeFigure!);

    await waitFor(() => {
      expect(screen.getByTestId('explain-number-drawer')).toHaveTextContent('Ingresos netos');
    });
    await waitFor(() => {
      expect(screen.getByTestId('explain-formula-section')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explain-formula-section').querySelector('.katex')).not.toBeNull();
  });

  it('5. Muestra estado honesto para cifras sin registro en el diccionario canónico', async () => {
    fetchMock.mockImplementation((url: string) => routeFetch(url));
    await askAndWaitAssistant('Analiza los ingresos netos del trimestre');

    const percentFigure = screen.getAllByTestId('chat-figure').find(
      (node) => node.getAttribute('data-figure') === '12.4%',
    );
    fireEvent.click(percentFigure!);

    await waitFor(() => {
      expect(screen.getByTestId('explain-uncertified-note')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explain-uncertified-note')).toHaveTextContent(
      'no está registrada en el Diccionario Semántico Inmutable',
    );
    expect(screen.getByText('Sin ruta Medallón certificada para esta cifra.')).toBeInTheDocument();
  });
});

describe('Gateway de linaje y cierre accesible (ST-FRONT-06.3 / ST-FRONT-06.4)', () => {
  it('6. Consulta /api/v1/lineage/table y prioriza el payload del gateway de OpenMetadata', async () => {
    fetchMock.mockImplementation((url: string) => routeFetch(url));
    await askAndWaitAssistant('¿Cuáles fueron los ingresos netos?');

    fireEvent.click(screen.getAllByTestId('metrics-chip')[0]);

    await waitFor(() => {
      expect(screen.getByTestId('explain-provenance')).toHaveTextContent('gateway de OpenMetadata');
    });

    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/lineage/table/gold.fact_ventas')),
    ).toBe(true);
    expect(screen.getByTestId('explain-audit-hash')).toHaveTextContent('a1b2c3d4e5f60718');
    expect(screen.getByTestId('explain-lineage-section')).toHaveTextContent('Quality Gate aprobado');
  });

  it('7. Sin gateway de linaje la cifra se declara NO certificada (sin 100% ni OpenMetadata)', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/v1/lineage/table/')) {
        return jsonResponse({ detail: 'OpenMetadata no disponible' }, false, 500);
      }
      return jsonResponse(LINEAGE_RESPONSE);
    });
    await askAndWaitAssistant('¿Cuáles fueron los ingresos netos?');

    fireEvent.click(screen.getAllByTestId('metrics-chip')[0]);

    await waitFor(() => {
      expect(screen.getByTestId('explain-provenance')).toHaveTextContent('Sin certificación del gateway');
    });
    expect(screen.getByTestId('explain-uncertified-certification')).toBeInTheDocument();

    // El drawer NO debe presentar calidad certificada del gateway.
    const quality = screen.getByTestId('explain-quality');
    expect(quality).not.toHaveTextContent('100%');
    expect(quality).not.toHaveTextContent('OpenMetadata');
    expect(quality).toHaveTextContent('Sin certificación');

    // El hash local se conserva como traza reproducible, no como firma.
    expect(screen.getByTestId('explain-audit-hash')).toHaveTextContent(/^[0-9a-f]{16}$/);
    expect(screen.getByTestId('lineage-stage-gold')).toHaveTextContent('gold.fact_ventas');
  });

  it('7b. Un gateway con etapas incompletas NO se rellena con etapas inventadas', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/v1/lineage/table/')) {
        return jsonResponse(
          {
            ...GATEWAY_LINEAGE_PAYLOAD,
            stages: [
              GATEWAY_LINEAGE_PAYLOAD.stages[0],
              // Etapa sin `location`: no es certificable y no debe completarse.
              { layer: 'bronze', table: 'bronze.pedidos_raw' },
            ],
          },
        );
      }
      return jsonResponse(LINEAGE_RESPONSE);
    });
    await askAndWaitAssistant('¿Cuáles fueron los ingresos netos?');

    fireEvent.click(screen.getAllByTestId('metrics-chip')[0]);

    await waitFor(() => {
      expect(screen.getByTestId('lineage-mini-graph')).toBeInTheDocument();
    });
    expect(screen.getByTestId('lineage-stage-source')).toHaveTextContent('public.pedidos_crm');
    // La etapa bronze incompleta se descarta: no aparece con valores inventados.
    expect(screen.queryByTestId('lineage-stage-bronze')).not.toBeInTheDocument();
    expect(screen.getByTestId('explain-provenance')).toHaveTextContent('gateway de OpenMetadata');
  });

  it('8. Cierra con Escape y con clic fuera del panel, y gestiona el foco', async () => {
    fetchMock.mockImplementation((url: string) => routeFetch(url));
    await askAndWaitAssistant('¿Cuáles fueron los ingresos netos?');

    const chip = screen.getAllByTestId('metrics-chip')[0];
    chip.focus();
    fireEvent.click(chip);
    await waitFor(() => {
      expect(screen.getByTestId('explain-drawer-root')).toHaveAttribute('aria-hidden', 'false');
    });
    expect(document.activeElement).toBe(screen.getByTestId('explain-number-drawer'));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('explain-drawer-root')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('explain-number-drawer').className).toContain('translate-x-full');
    await waitFor(() => {
      expect(document.activeElement).toBe(chip);
    });

    fireEvent.click(chip);
    await waitFor(() => {
      expect(screen.getByTestId('explain-drawer-root')).toHaveAttribute('aria-hidden', 'false');
    });

    const backdrop = screen.getByTestId('explain-drawer-root').firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.getByTestId('explain-drawer-root')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('resolveLineage · contrato de certificación (HU-FRONT-08)', () => {
  const options = { lastSyncIso: '2026-10-20T14:02:00.000Z' };

  it('11. Sin tabla Gold no se consulta el gateway y el resultado no está certificado', async () => {
    const fetchImpl = vi.fn();

    const lineage = await resolveNumberLineage(
      { sourceMessageId: 'm1', label: 'Indicador no canónico', rawValue: 42 },
      { ...options, fetchImpl: fetchImpl as unknown as typeof fetchTableLineage },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lineage.provenance).toBe('uncertified');
    expect(lineage.certification.qualityPercent).toBeNull();
    expect(lineage.certification.qualitySummary).not.toContain('OpenMetadata');
    expect(lineage.certification.auditHashSource).toBe('derived-local');
  });

  it('12. Un gateway que no devuelve etapas certificables degrada a "no certificado"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      table: 'gold.fact_ventas',
      stages: [{ layer: 'gold' }],
      transformation: 'x',
      certification: { quality_percent: 100, quality_summary: 'x', last_sync: 'y', audit_hash: 'z' },
    });

    const lineage = await resolveNumberLineage(
      { sourceMessageId: 'm2', label: 'Venta Neta', rawValue: 1490, goldTableHint: 'gold.fact_ventas' },
      { ...options, fetchImpl: fetchImpl as unknown as typeof fetchTableLineage },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(lineage.provenance).toBe('uncertified');
    // Sin gateway no hay calidad certificada, aunque el gateway la reportara.
    expect(lineage.certification.qualityPercent).toBeNull();
    expect(lineage.certification.qualitySummary).not.toContain('OpenMetadata');
    // Las etapas provienen del diccionario canónico local (doc canónico 04),
    // nunca de valores literales inventados en tiempo de ejecución.
    expect(lineage.stages.map((stage) => stage.table)).toEqual([
      'public.pedidos_crm',
      'bronze.pedidos_raw',
      'silver.pedidos',
      'gold.fact_ventas',
    ]);
  });

  it('13. mapGatewayStage descarta etapas sin tabla o sin ubicación', () => {
    expect(mapGatewayStage({ layer: 'gold', table: 'gold.fact_ventas' })).toBeNull();
    expect(mapGatewayStage({ layer: 'gold', location: 's3://x/' })).toBeNull();
    expect(mapGatewayStage({ layer: 'desconocida', table: 't', location: 'l' })).toBeNull();

    const stage = mapGatewayStage({
      layer: 'gold',
      table: 'gold.fact_ventas',
      location: 's3://midas-gold/fact_ventas/',
      description: 'Mart dimensional.',
    });
    expect(stage?.title).toBe('Gold Mart');
    expect(stage?.table).toBe('gold.fact_ventas');
  });
});

describe('parseFigure · detección y formato de cifras', () => {  it('9. Interpreta cifras en formato es-CO, con sufijos y porcentajes', () => {
    expect(parseFigureValue('1.490')).toBe(1490);
    expect(parseFigureValue('1,490,000')).toBe(1490000);
    expect(parseFigureValue('12.4%')).toBe(12.4);
    expect(parseFigureValue('$1.2M')).toBe(1200000);
    expect(parseFigureValue('850K')).toBe(850000);

    expect(extractFigureTokens('Creció 12.4% y alcanzó 1.490 USD en 2026.')).toEqual(['12.4%', '1.490']);
  });

  it('10. Deriva hashes de auditoría determinísticos y frescura relativa legible', () => {
    expect(deriveAuditHash('venta_neta|gold.fact_ventas|2026-10-20')).toBe(
      deriveAuditHash('venta_neta|gold.fact_ventas|2026-10-20'),
    );
    expect(deriveAuditHash('a')).not.toBe(deriveAuditHash('b'));
    expect(deriveAuditHash('venta_neta')).toMatch(/^[0-9a-f]{16}$/);

    const now = new Date('2026-10-20T14:32:00.000Z');
    expect(formatRelativeFreshness('2026-10-20T14:02:00.000Z', now)).toBe('Actualizado hace 30 min');
    expect(formatRelativeFreshness('not-a-date', now)).toBe('Sin registro de frescura');
  });
});
