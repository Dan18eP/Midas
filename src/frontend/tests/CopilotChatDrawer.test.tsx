import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CopilotChatDrawer,
  CopilotChatProvider,
  CopilotChatWidget,
  DEFAULT_SUGGESTIONS,
  useCopilotChat,
} from '../components/copilot';
import { TEXT_TO_GOLD_CONFIRMATION } from '../components/copilot/textToGold';
import { normalizeEChartsOption, optionToTable } from '../components/copilot/chartOptions';

const { getDataURL } = vi.hoisted(() => ({
  getDataURL: vi.fn(() => 'data:image/png;base64,MIDAS'),
}));

vi.mock('echarts-for-react/lib/core', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  const MockECharts = react.forwardRef(function MockECharts(
    props: { option: unknown },
    ref: React.Ref<unknown>,
  ) {
    react.useImperativeHandle(ref, () => ({ getEchartsInstance: () => ({ getDataURL }) }));
    return react.createElement('div', {
      'data-testid': 'mock-echarts',
      'data-option': JSON.stringify(props.option),
    });
  });
  return { default: MockECharts };
});

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

const LINE_OPTION = {
  title: { text: 'Ingresos netos por mes' },
  tooltip: { trigger: 'axis' },
  legend: { data: ['Ingresos netos'] },
  xAxis: { type: 'category', name: 'mes', data: ['2026-01', '2026-02', '2026-03'] },
  yAxis: { type: 'value', name: 'ingresos_netos' },
  series: [{ name: 'Ingresos netos', type: 'line', smooth: true, data: [1200, 1350, 1490] }],
};

const DISCOVERY_RESPONSE = {
  thread_id: 'session_test_01',
  intent: 'discovery',
  response: [
    'Puedo ayudarte a explorar estas fuentes:',
    '- 🗄️ PostgreSQL: `crm_operaciones`',
    '- 📁 Excel: `Presupuesto_Corporativo_2026.xlsx`',
    '- 🌐 API REST: `helpdesk_tickets_live`',
  ].join('\n'),
  suggestions: ['Explorar tablas de CRM', 'Analizar cumplimiento de presupuesto', 'Crear nuevo Mart Gold'],
  needs_clarification: false,
  echarts_option: null,
  metrics_summary: [],
};

const ANALYTICS_RESPONSE = {
  thread_id: 'session_test_01',
  intent: 'analytics',
  response: '### Hallazgo principal\nLos ingresos netos crecieron **12.4%** entre enero y marzo de 2026.\n\n1. Comparativa histórica\n2. Recomendación de negocio',
  suggestions: ['Comparar contra las metas del presupuesto'],
  needs_clarification: false,
  echarts_option: LINE_OPTION,
  metrics_summary: [
    { label: 'Ingresos netos', value: 1490, unit: 'USD' },
    { label: 'Variación', value: '12.4%' },
  ],
};

const TEXT_TO_GOLD_RESPONSE = {
  thread_id: 'session_test_01',
  intent: 'analytics',
  response:
    'Semáforo de Costo Spark: Verde (escaneo eficiente de 14 MB). ¿Deseas que guarde esta vista en la capa Gold y programe su actualización automática cada 6 horas en Apache Airflow?',
  suggestions: [],
  needs_clarification: false,
  echarts_option: {
    xAxis: { type: 'category', name: 'region', data: ['NORTE', 'SUR'] },
    yAxis: { type: 'value', name: 'cumplimiento' },
    series: [{ name: 'Cumplimiento', type: 'bar', data: [84, 103.3] }],
  },
  metrics_summary: [],
};

function renderCopilot() {
  return render(
    <CopilotChatProvider>
      <CopilotChatWidget />
      <CopilotChatDrawer />
    </CopilotChatProvider>,
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

beforeEach(() => {
  fetchMock.mockReset();
  getDataURL.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CopilotChatDrawer · Widget flotante, historial y estados', () => {
  it('1. Renderiza el widget flotante y abre el drawer con historial, pills y composer', () => {
    renderCopilot();
    expect(screen.getByTestId('copilot-widget')).toBeInTheDocument();

    const drawer = openDrawer();
    expect(drawer).toHaveAttribute('data-expanded', 'false');
    expect(within(drawer).getByText('Copiloto Agéntico')).toBeInTheDocument();
    expect(within(drawer).getAllByTestId('chat-message-assistant').length).toBe(1);
    expect(within(drawer).getByText(/Copiloto Agéntico de Midas/)).toBeInTheDocument();

    DEFAULT_SUGGESTIONS.forEach((pill, index) => {
      expect(within(drawer).getByTestId(`quick-prompt-pill-${index}`)).toHaveTextContent(pill);
    });

    expect(within(drawer).getByTestId('copilot-input')).toBeInTheDocument();
    expect(within(drawer).getByTestId('copilot-send-button')).toBeDisabled();
    expect(within(drawer).getByText(/Enter para enviar/)).toBeInTheDocument();
  });

  it('2. Expande y contrae el drawer, y lo cierra con Escape o clic en el backdrop', () => {
    renderCopilot();
    openDrawer();

    fireEvent.click(screen.getByTestId('copilot-toggle-expand'));
    expect(screen.getByTestId('copilot-drawer')).toHaveAttribute('data-expanded', 'true');

    fireEvent.click(screen.getByTestId('copilot-toggle-expand'));
    expect(screen.getByTestId('copilot-drawer')).toHaveAttribute('data-expanded', 'false');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('copilot-drawer-root')).toHaveAttribute('aria-hidden', 'true');

    const drawer = screen.getByTestId('copilot-drawer');
    expect(drawer.className).toContain('translate-x-full');
  });

  it('3. Envía un prompt desde una pill y renderiza la respuesta del agente', async () => {
    fetchMock.mockReturnValue(jsonResponse(DISCOVERY_RESPONSE));
    renderCopilot();
    openDrawer();

    fireEvent.click(screen.getByTestId('quick-prompt-pill-0'));

    expect(screen.getByTestId('chat-message-user')).toHaveTextContent('Explorar tablas de CRM');

    await waitFor(() => {
      expect(screen.getAllByTestId('chat-message-assistant').length).toBe(2);
    });
    expect(screen.getByText('crm_operaciones')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ message: 'Explorar tablas de CRM' });
  });

  it('4. Expone los estados de escritura thinking → querying → visualizing', async () => {
    vi.useFakeTimers();
    let resolveFetch: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));

    renderCopilot();
    openDrawer();
    ask('Quiero consultar las ventas de 2026');

    expect(screen.getByTestId('chat-status-indicator')).toHaveAttribute('data-status', 'thinking');
    expect(screen.getByText('Pensando')).toBeInTheDocument();
    expect(screen.getByText('Analizando tu solicitud...')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('chat-status-indicator')).toHaveAttribute('data-status', 'querying');
    expect(screen.getByText('Consultando esquema')).toBeInTheDocument();
    expect(screen.getByText('Consultando esquema...')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByTestId('chat-status-indicator')).toHaveAttribute('data-status', 'visualizing');
    expect(screen.getByText('Generando visualización')).toBeInTheDocument();

    await act(async () => {
      resolveFetch(jsonResponse(ANALYTICS_RESPONSE) as unknown as Response);
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.queryByTestId('chat-status-indicator')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('5. Muestra error amigable cuando el gateway no responde', async () => {
    fetchMock.mockReturnValue(jsonResponse({ detail: 'Error durante el procesamiento del diálogo.' }, false, 500));
    renderCopilot();
    openDrawer();

    ask('¿Cuántas filas limpias hay en Silver?');

    await waitFor(() => {
      expect(screen.getByTestId('chat-status-indicator')).toHaveAttribute('data-status', 'error');
    });
    expect(screen.getByText('Error durante el procesamiento del diálogo.')).toBeInTheDocument();
  });
});

describe('EChartsRenderer · Visualización dinámica, tabla de datos y exportación', () => {
  it('6. Renderiza la opción ECharts del agente con tooltips enriquecidos y chips de métricas', async () => {
    fetchMock.mockReturnValue(jsonResponse(ANALYTICS_RESPONSE));
    renderCopilot();
    openDrawer();
    ask('Ingresos netos por mes de 2026');

    await waitFor(() => {
      expect(screen.getByTestId('mock-echarts')).toBeInTheDocument();
    });

    const chart = screen.getByTestId('mock-echarts');
    const option = JSON.parse(chart.getAttribute('data-option') ?? '{}');
    expect(option.tooltip.trigger).toBe('axis');
    expect(option.tooltip.confine).toBe(true);
    expect(option.grid.containLabel).toBe(true);
    expect(option.xAxis.data).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(screen.getByTestId('metrics-summary-chips')).toHaveTextContent('Ingresos netos');
    expect(screen.getAllByText('12.4%').length).toBeGreaterThan(0);
  });

  it('7. Alterna a la vista de tabla de datos crudos construida desde la opción del agente', async () => {
    fetchMock.mockReturnValue(jsonResponse(ANALYTICS_RESPONSE));
    renderCopilot();
    openDrawer();
    ask('Ingresos netos por mes de 2026');

    await waitFor(() => {
      expect(screen.getByTestId('echarts-view-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('echarts-view-table'));
    const table = screen.getByTestId('echarts-data-table');
    expect(within(table).getByText('mes')).toBeInTheDocument();
    expect(within(table).getByText('Ingresos netos')).toBeInTheDocument();
    expect(within(table).getByText('2026-03')).toBeInTheDocument();
    expect(within(table).getByText('1.490')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('echarts-view-chart'));
    expect(screen.getByTestId('mock-echarts')).toBeInTheDocument();
  });

  it('8. Exporta la visualización en PNG a través de la instancia ECharts', async () => {
    fetchMock.mockReturnValue(jsonResponse(ANALYTICS_RESPONSE));
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    renderCopilot();
    openDrawer();
    ask('Ingresos netos por mes de 2026');

    await waitFor(() => {
      expect(screen.getByTestId('echarts-export-png')).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId('echarts-export-png'));
    expect(getDataURL).toHaveBeenCalledWith({ type: 'png', pixelRatio: 2, backgroundColor: '#FFFFFF' });
    expect(anchorClick).toHaveBeenCalled();

    anchorClick.mockRestore();
  });

  it('9. Soporta mapas de calor inyectando visualMap y su tabla de valores', () => {
    const heatmapOption = {
      xAxis: { type: 'category', name: 'hora', data: ['00', '01'] },
      yAxis: { type: 'category', name: 'region', data: ['NORTE', 'SUR'] },
      series: [{ name: 'Transacciones', type: 'heatmap', data: [[0, 0, 10], [0, 1, 22], [1, 0, 7], [1, 1, 31]] }],
    };

    const normalized = normalizeEChartsOption(heatmapOption);
    expect(normalized?.visualMap).toBeTruthy();
    expect(normalized?.tooltip).toMatchObject({ trigger: 'item' });

    const table = optionToTable(heatmapOption);
    expect(table.columns).toEqual(['hora', 'region', 'Transacciones']);
    expect(table.rows[0]).toEqual(['00', 'NORTE', 10]);

    const chartTable = optionToTable(LINE_OPTION);
    expect(chartTable.columns).toEqual(['mes', 'Ingresos netos']);
    expect(chartTable.rows.length).toBe(3);
  });
});

describe('Text-to-Gold · Botón de aprobación de pipeline en Airflow', () => {
  it('10. Muestra el botón de aprobación y confirma la materialización vía el agente', async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(TEXT_TO_GOLD_RESPONSE));
    fetchMock.mockReturnValue(jsonResponse(DISCOVERY_RESPONSE));

    renderCopilot();
    openDrawer();
    ask('Cruza las ventas del CRM con las metas del Excel');

    await waitFor(() => {
      expect(screen.getByTestId('text-to-gold-card')).toBeInTheDocument();
    });
    const card = screen.getByTestId('text-to-gold-card');
    const button = within(card).getByTestId('approve-pipeline-button');
    expect(button).toHaveTextContent('Aprobar y Crear Pipeline en Airflow');
    expect(within(card).getByTestId('text-to-gold-preview')).toBeInTheDocument();

    fireEvent.click(button);

    await waitFor(() => {
      expect(within(card).getByTestId('approve-pipeline-button')).toHaveTextContent('Pipeline aprobado');
    });
    expect(within(card).getByTestId('approve-pipeline-button')).toBeDisabled();

    const [, secondCall] = fetchMock.mock.calls[1];
    expect(JSON.parse(secondCall.body).message).toBe(TEXT_TO_GOLD_CONFIRMATION);
    expect(card).toHaveAttribute('data-approval-state', 'approved');
  });

  it('11. No muestra la tarjeta de aprobación en respuestas analíticas normales', async () => {
    fetchMock.mockReturnValue(jsonResponse(ANALYTICS_RESPONSE));
    renderCopilot();
    openDrawer();
    ask('Ingresos netos por mes de 2026');

    await waitFor(() => {
      expect(screen.getAllByTestId('chat-message-assistant').length).toBe(2);
    });
    expect(screen.queryByTestId('text-to-gold-card')).not.toBeInTheDocument();
  });
});

describe('useCopilotChat · Unicidad del hilo conversacional', () => {
  it('13. Envía el primer turno con el hilo recién seleccionado, sin usar el identificador previo', async () => {
    fetchMock.mockReturnValue(jsonResponse({ ...DISCOVERY_RESPONSE, thread_id: 'sess_recien_creada' }));

    const { result } = renderHook(() => useCopilotChat());
    const previousThreadId = result.current.threadId;

    act(() => {
      result.current.setThreadId('sess_recien_creada');
    });

    await act(async () => {
      await result.current.send('Primer mensaje de la conversación');
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.thread_id).toBe('sess_recien_creada');
    expect(body.thread_id).not.toBe(previousThreadId);
    expect(result.current.threadId).toBe('sess_recien_creada');
  });

  it('14. Mantiene el mismo hilo entre turnos consecutivos y adopta el del backend', async () => {
    fetchMock
      .mockReturnValueOnce(jsonResponse({ ...DISCOVERY_RESPONSE, thread_id: 'sess_backend' }))
      .mockReturnValueOnce(jsonResponse({ ...DISCOVERY_RESPONSE, thread_id: 'sess_backend' }));

    const { result } = renderHook(() => useCopilotChat());

    await act(async () => {
      await result.current.send('Primer turno');
    });
    await act(async () => {
      await result.current.send('Segundo turno');
    });

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(firstBody.thread_id).toBeTruthy();
    expect(secondBody.thread_id).toBe('sess_backend');
    expect(result.current.threadId).toBe('sess_backend');
  });
});

describe('PromptComposer · Autosuggest de preguntas frecuentes', () => {
  it('12. Sugiere coincidencias mientras se escribe y las aplica al hacer clic', () => {
    renderCopilot();
    openDrawer();

    const input = screen.getByTestId('copilot-input') as HTMLTextAreaElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Explorar' } });

    const option = screen.getByTestId('autosuggest-option-0');
    expect(option).toHaveTextContent('Explorar tablas de CRM');

    fireEvent.click(option);
    expect(input.value).toBe('Explorar tablas de CRM');
  });
});
