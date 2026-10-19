import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTelemetryStream } from '../hooks/useTelemetryStream';
import { TelemetryEventPayload } from '../types/telemetry';

// Mock EventSource implementando EventEmitter
class MockEventSource {
  public url: string;
  public readyState: number = 0; // CONNECTING
  public onopen: (() => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public closed: boolean = false;
  private listeners: Map<string, Function[]> = new Map();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  static instances: MockEventSource[] = [];

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
    this.readyState = 2; // CLOSED
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) {
      this.onopen();
    }
  }

  simulateEvent(type: string, data: any) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const event = { data: payload } as MessageEvent;

    // Disparar listener específico
    const list = this.listeners.get(type);
    if (list) {
      list.forEach((fn) => fn(event));
    }

    // Si es message y hay onmessage
    if (type === 'message' && this.onmessage) {
      this.onmessage(event);
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

describe('useTelemetryStream Hook Specification & Resiliency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('1. Abre la conexión EventSource al montar con la URL configurada', () => {
    const factory = (url: string) => new MockEventSource(url) as unknown as EventSource;

    const { result } = renderHook(() =>
      useTelemetryStream({
        url: 'http://localhost:8000/api/v1/telemetry/stream',
        eventSourceFactory: factory,
      })
    );

    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toBe('http://localhost:8000/api/v1/telemetry/stream');
    expect(result.current.connectionStatus).toBe('CONNECTING');

    // Al abrir el socket
    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });

    expect(result.current.connectionStatus).toBe('CONNECTED');
    expect(result.current.reconnectAttempts).toBe(0);
  });

  it('2. Procesa un evento "telemetry" válido y actualiza métricas por nodo', () => {
    const factory = (url: string) => new MockEventSource(url) as unknown as EventSource;
    const onEventSpy = vi.fn();

    const { result } = renderHook(() =>
      useTelemetryStream({
        eventSourceFactory: factory,
        onEvent: onEventSpy,
      })
    );

    const es = MockEventSource.instances[0];
    act(() => {
      es.simulateOpen();
    });

    const validPayload: TelemetryEventPayload = {
      event_id: 'evt_1001_abc',
      pipeline_id: 'pipe_spark_silver',
      node_id: 'silver_cleansing',
      status: 'HEALTHY',
      records_in: 5000,
      records_out: 4986,
      latency_ms: 45.0,
      timestamp: '2026-10-19T10:00:00Z',
      details: {
        quarantined_records: 14,
        throughput_rps: 1200,
      },
    };

    act(() => {
      es.simulateEvent('telemetry', validPayload);
    });

    expect(result.current.lastEvent).toEqual(validPayload);
    expect(result.current.lastEventId).toBe('evt_1001_abc');
    expect(result.current.metricsByNode['silver_cleansing']).toEqual(validPayload);
    expect(result.current.sparkRps).toBe(1200);
    expect(onEventSpy).toHaveBeenCalledWith(validPayload);
  });

  it('3. Maneja JSON inválido o malformado sin hacer caer el hook', () => {
    const factory = (url: string) => new MockEventSource(url) as unknown as EventSource;

    const { result } = renderHook(() =>
      useTelemetryStream({
        eventSourceFactory: factory,
      })
    );

    const es = MockEventSource.instances[0];
    act(() => {
      es.simulateOpen();
    });

    // Enviar string no JSON
    act(() => {
      es.simulateEvent('telemetry', 'MALFORMED_JSON_STRING_{');
    });

    // El hook sigue en estado CONNECTED y sin evento válido
    expect(result.current.connectionStatus).toBe('CONNECTED');
    expect(result.current.lastEvent).toBeNull();
  });

  it('4. Descarta eventos incompletos que no cumplen el contrato mínimo', () => {
    const factory = (url: string) => new MockEventSource(url) as unknown as EventSource;

    const { result } = renderHook(() =>
      useTelemetryStream({
        eventSourceFactory: factory,
      })
    );

    const es = MockEventSource.instances[0];
    act(() => {
      es.simulateOpen();
    });

    // Falta node_id o records_out
    const incompletePayload = {
      event_id: 'evt_999',
      status: 'HEALTHY',
    };

    act(() => {
      es.simulateEvent('telemetry', incompletePayload);
    });

    expect(result.current.lastEvent).toBeNull();
    expect(result.current.lastEventId).toBeNull();
  });

  it('5. Maneja desconexión con backoff exponencial y reintenta la conexión', () => {
    const factory = (url: string) => new MockEventSource(url) as unknown as EventSource;

    const { result } = renderHook(() =>
      useTelemetryStream({
        url: 'http://localhost:8000/api/v1/telemetry/stream',
        eventSourceFactory: factory,
        initialBackoffMs: 1000,
        backoffMultiplier: 2.0,
        maxReconnectAttempts: 3,
      })
    );

    const es1 = MockEventSource.instances[0];
    act(() => {
      es1.simulateOpen();
    });
    expect(result.current.connectionStatus).toBe('CONNECTED');

    // Fallo 1: transición a RECONNECTING
    act(() => {
      es1.simulateError();
    });

    expect(es1.closed).toBe(true);
    expect(result.current.connectionStatus).toBe('RECONNECTING');
    expect(result.current.reconnectAttempts).toBe(1);

    // Avanzar temporizador: 1000ms
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockEventSource.instances.length).toBe(2);
    const es2 = MockEventSource.instances[1];

    // Fallo 2: delay = 1000 * 2 = 2000ms
    act(() => {
      es2.simulateError();
    });
    expect(result.current.reconnectAttempts).toBe(2);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(MockEventSource.instances.length).toBe(3);
    const es3 = MockEventSource.instances[2];

    // Fallo 3: supera maxReconnectAttempts (3) -> pasa a DISCONNECTED
    act(() => {
      es3.simulateError();
    });
    expect(result.current.reconnectAttempts).toBe(3);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(MockEventSource.instances.length).toBe(4);
    const es4 = MockEventSource.instances[3];

    act(() => {
      es4.simulateError();
    });
    expect(result.current.connectionStatus).toBe('DISCONNECTED');
  });

  it('6. Propaga Last-Event-ID en la URL durante la reconexión para replay del ring buffer', () => {
    const factory = (url: string) => new MockEventSource(url) as unknown as EventSource;

    const { result } = renderHook(() =>
      useTelemetryStream({
        url: 'http://localhost:8000/api/v1/telemetry/stream',
        eventSourceFactory: factory,
        initialBackoffMs: 500,
      })
    );

    const es1 = MockEventSource.instances[0];
    act(() => {
      es1.simulateOpen();
      es1.simulateEvent('telemetry', {
        event_id: 'evt_last_recovered_777',
        pipeline_id: 'pipe_test',
        node_id: 'source_postgres',
        status: 'HEALTHY',
        records_in: 0,
        records_out: 4520,
        latency_ms: 10,
      });
    });

    expect(result.current.lastEventId).toBe('evt_last_recovered_777');

    // Desconexión
    act(() => {
      es1.simulateError();
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(MockEventSource.instances.length).toBe(2);
    const es2 = MockEventSource.instances[1];
    expect(es2.url).toContain('last_event_id=evt_last_recovered_777');
  });

  it('7. Limpia recursos, cierra EventSource y cancela temporizadores al desmontar', () => {
    const factory = (url: string) => new MockEventSource(url) as unknown as EventSource;

    const { unmount } = renderHook(() =>
      useTelemetryStream({
        eventSourceFactory: factory,
        initialBackoffMs: 1000,
      })
    );

    const es1 = MockEventSource.instances[0];

    // Provocar reconexión programada
    act(() => {
      es1.simulateError();
    });

    // Desmontar el hook antes de que el timer expire
    unmount();

    // Avanzar tiempo
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // No se creó otra instancia huérfana
    expect(MockEventSource.instances.length).toBe(1);
    expect(es1.closed).toBe(true);
  });

  it('8. Permite desconexión y reconexión manual vía connect() y disconnect()', () => {
    const factory = (url: string) => new MockEventSource(url) as unknown as EventSource;

    const { result } = renderHook(() =>
      useTelemetryStream({
        autoConnect: false,
        eventSourceFactory: factory,
      })
    );

    expect(MockEventSource.instances.length).toBe(0);
    expect(result.current.connectionStatus).toBe('DISCONNECTED');

    // Conectar manualmente
    act(() => {
      result.current.connect();
    });

    expect(MockEventSource.instances.length).toBe(1);
    expect(result.current.connectionStatus).toBe('CONNECTING');

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });
    expect(result.current.connectionStatus).toBe('CONNECTED');

    // Desconectar manualmente
    act(() => {
      result.current.disconnect();
    });

    expect(MockEventSource.instances[0].closed).toBe(true);
    expect(result.current.connectionStatus).toBe('DISCONNECTED');
  });
});
