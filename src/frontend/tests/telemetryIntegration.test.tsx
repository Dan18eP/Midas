import { INITIAL_CANVAS_NODES, INITIAL_CANVAS_EDGES } from '../components/canvas/topology/initialTopology';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactFlowProvider } from '@xyflow/react';
import { PipelineCanvas } from '../components/canvas/PipelineCanvas';
import { TelemetryConnectionBanner } from '../components/canvas/TelemetryConnectionBanner';
import {
  DataFlowEdge,
  calculateParticleDuration,
} from '../components/canvas/edges/DataFlowEdge';
import { TelemetryEventPayload } from '../types/telemetry';

// Mock de EventSource para las pruebas de integración
class MockEventSourceIntegration {
  public url: string;
  public readyState: number = 0;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public closed: boolean = false;
  private listeners: Map<string, Function[]> = new Map();

  constructor(url: string) {
    this.url = url;
    MockEventSourceIntegration.latestInstance = this;
  }

  static latestInstance: MockEventSourceIntegration | null = null;

  addEventListener(type: string, listener: Function) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: Function) {
    const list = this.listeners.get(type);
    if (list) {
      this.listeners.set(
        type,
        list.filter((l) => l !== listener)
      );
    }
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  simulateOpen() {
    this.readyState = 1;
    if (this.onopen) {
      this.onopen();
    }
  }

  simulateEvent(type: string, data: any) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const event = { data: payload } as MessageEvent;
    const list = this.listeners.get(type);
    if (list) {
      list.forEach((fn) => fn(event));
    }
    if (type === 'message' && this.onmessage) {
      this.onmessage(event);
    }
  }
}

// Mock de ReactFlow
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    ReactFlow: ({ children, nodes, edges }: any) => (
      <div data-testid="mock-react-flow">
        <div data-testid="nodes-container">
          {nodes?.map((node: any) => (
            <div
              key={node.id}
              data-testid={`canvas-node-${node.id}`}
              data-status={node.data.status}
              data-records-in={node.data.recordsIn}
              data-records-out={node.data.recordsOut}
            >
              <span>{node.data.label}</span>
              <span data-testid={`records-out-${node.id}`}>{node.data.recordsOut}</span>
              <span data-testid={`status-${node.id}`}>{node.data.status}</span>
            </div>
          ))}
        </div>
        <div data-testid="edges-container">
          {edges?.map((edge: any) => (
            <div
              key={edge.id}
              data-testid={`canvas-edge-${edge.id}`}
              data-volume={edge.data?.volume}
              data-rps={edge.data?.recordsPerSecond}
              data-label={edge.data?.label}
            >
              {edge.data?.label}
            </div>
          ))}
        </div>
        {children}
      </div>
    ),
    Controls: () => <div data-testid="mock-controls">Controls</div>,
    MiniMap: () => <div data-testid="mock-minimap">MiniMap</div>,
    Background: () => <div data-testid="mock-background">Background</div>,
    useReactFlow: () => ({
      fitView: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
    }),
  };
});

describe('Telemetry Connection Banner States & Accessibility', () => {
  it('1. Renderiza estado CONNECTED con badge y estilo accesible', () => {
    render(
      <TelemetryConnectionBanner
        status="CONNECTED"
        lastEventTime="2026-10-19T10:15:30Z"
      />
    );

    const banner = screen.getByTestId('telemetry-connection-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Telemetría SSE en Vivo')).toBeInTheDocument();
  });

  it('2. Renderiza estado RECONNECTING con conteo de intentos y aviso de datos en caché', () => {
    render(
      <TelemetryConnectionBanner
        status="RECONNECTING"
        reconnectAttempts={3}
      />
    );

    expect(screen.getByText('Reconectando (Intento 3)...')).toBeInTheDocument();
    expect(screen.getByText('Métricas en caché (posiblemente desactualizadas)')).toBeInTheDocument();
  });

  it('3. Renderiza estado DISCONNECTED con botón para reconexión manual', () => {
    const reconnectSpy = vi.fn();
    render(
      <TelemetryConnectionBanner
        status="DISCONNECTED"
        onManualReconnect={reconnectSpy}
      />
    );

    expect(screen.getByText('Telemetría Desconectada')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /reconectar/i });
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(reconnectSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Particle Speed Modulation & Edge Determinism', () => {
  it('4. calculateParticleDuration calcula duraciones proporcionales y acotadas', () => {
    // Nominal: 1,000 RPS -> 2.50s
    expect(calculateParticleDuration(1000)).toBe('2.50s');

    // Tasa baja: 100 RPS -> dur = 2.5 / (0.1^0.35) = 5.6 -> clamped a maxDuration (4.50s)
    expect(calculateParticleDuration(100)).toBe('4.50s');

    // Tasa alta: 5,000 RPS -> dur = 2.5 / (5^0.35) = ~1.42s
    expect(calculateParticleDuration(5000)).toBe('1.42s');

    // Tasa extrema alta: 100,000 RPS -> clamped a minDuration (0.60s)
    expect(calculateParticleDuration(100000)).toBe('0.60s');

    // Casos borde: valores negativos, 0 o inválidos -> fallback nominal seguro a 2.50s
    expect(calculateParticleDuration(0)).toBe('2.50s');
    expect(calculateParticleDuration(-500)).toBe('2.50s');
    expect(calculateParticleDuration(NaN)).toBe('2.50s');
    expect(calculateParticleDuration(undefined)).toBe('2.50s');
  });

  it('5. DataFlowEdge aplica particleDuration en animateMotion SVG', () => {
    const { container } = render(
      <ReactFlowProvider>
        <svg>
          <DataFlowEdge
            {...({
              id: 'edge_test',
              source: 'a',
              target: 'b',
              sourceX: 0,
              sourceY: 0,
              targetX: 100,
              targetY: 100,
              animated: true,
              data: {
                label: '5,000 filas/s',
                recordsPerSecond: 5000,
              },
            } as any)}
          />
        </svg>
      </ReactFlowProvider>
    );

    const animateMotion = container.querySelector('animateMotion');
    expect(animateMotion).toBeInTheDocument();
    expect(animateMotion).toHaveAttribute('dur', '1.42s');
  });
});

describe('PipelineCanvas Real-Time SSE Integration & 60 FPS rAF Batching', () => {
  beforeEach(() => {
    MockEventSourceIntegration.latestInstance = null;
  });

  it('6. Conecta el Canvas al stream SSE y actualiza en caliente los nodos mediante rAF', async () => {
    const factory = (url: string) =>
      new MockEventSourceIntegration(url) as unknown as EventSource;

    render(
      <PipelineCanvas initialNodes={INITIAL_CANVAS_NODES} initialEdges={INITIAL_CANVAS_EDGES}
        sseUrl="http://localhost:8000/api/v1/telemetry/stream"
        autoConnectSSE={true}
        eventSourceFactory={factory}
      />
    );

    const es = MockEventSourceIntegration.latestInstance;
    expect(es).not.toBeNull();

    // Abrir conexión
    act(() => {
      es!.simulateOpen();
    });

    expect(screen.getByText('Telemetría SSE en Vivo')).toBeInTheDocument();

    // Emitir evento para Silver Cleanse
    const silverEvent: TelemetryEventPayload = {
      event_id: 'evt_batch_01',
      pipeline_id: 'pipe_spark_silver',
      node_id: 'silver_cleansing',
      status: 'RUNNING',
      records_in: 7500,
      records_out: 7480,
      latency_ms: 32.5,
      timestamp: '2026-10-19T10:30:00Z',
      details: {
        quarantined_records: 20,
        throughput_rps: 4200,
      },
    };

    act(() => {
      es!.simulateEvent('telemetry', silverEvent);
    });

    // Esperar a que el frame rAF se ejecute en JSDOM
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Nodo Silver actualizado con los nuevos valores de registros y estado
    const silverRecords = screen.getByTestId('records-out-silver_cleansing');
    expect(silverRecords.textContent).toBe('7480');

    const silverStatus = screen.getByTestId('status-silver_cleansing');
    expect(silverStatus.textContent).toBe('RUNNING');

    // El edge bronze -> silver debe haber actualizado su etiqueta con el nuevo RPS
    const edge = screen.getByTestId('canvas-edge-edge_bronze_silver');
    expect(edge).toHaveAttribute('data-rps', '4200');
    expect(edge.textContent).toMatch(/4[.,]?200 RPS/);
  });

  it('7. Modula el edge de cuarentena y actualiza el nodo Guardian cuando hay desvío', async () => {
    const factory = (url: string) =>
      new MockEventSourceIntegration(url) as unknown as EventSource;

    render(
      <PipelineCanvas initialNodes={INITIAL_CANVAS_NODES} initialEdges={INITIAL_CANVAS_EDGES}
        autoConnectSSE={true}
        eventSourceFactory={factory}
      />
    );

    const es = MockEventSourceIntegration.latestInstance;
    act(() => {
      es!.simulateOpen();
    });

    // Inyectar evento de Midas Guardian con auto-sanación
    const guardianEvent: TelemetryEventPayload = {
      event_id: 'evt_guardian_02',
      pipeline_id: 'pipe_medallion_e2e',
      node_id: 'guardian_monitor',
      status: 'AUTO_HEALING',
      records_in: 25,
      records_out: 25,
      latency_ms: 12.0,
      timestamp: '2026-10-19T10:31:00Z',
      details: {
        anomaly_type: 'F3_NEGATIVE_AMOUNT',
        playbook_id: 'PB-03-QUARANTINE',
        quarantined_records: 25,
      },
    };

    act(() => {
      es!.simulateEvent('telemetry', guardianEvent);
    });

    // Esperar a que el frame rAF se ejecute
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const guardianStatus = screen.getByTestId('status-guardian_monitor');
    expect(guardianStatus.textContent).toBe('AUTO_HEALING');

    const guardianEdge = screen.getByTestId('canvas-edge-edge_silver_guardian');
    expect(guardianEdge).toHaveAttribute('data-volume', '25');
    expect(guardianEdge.textContent).toContain('25 en Cuarentena');
  });
});
