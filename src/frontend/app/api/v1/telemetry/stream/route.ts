import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

interface ScenarioEvent {
  event_id: string;
  pipeline_id: string;
  node_id: string;
  status: string;
  records_in: number;
  records_out: number;
  latency_ms: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

// Escenarios canónicos T0 a T3 para demostración y verificación en vivo
const CANONICAL_FLOW: ScenarioEvent[] = [
  // 1. Ingesta normal
  {
    event_id: 'evt_demo_src_postgres',
    pipeline_id: 'pipe_airflow_ingest',
    node_id: 'source_postgres',
    status: 'HEALTHY',
    records_in: 0,
    records_out: 4850,
    latency_ms: 12.0,
    timestamp: new Date().toISOString(),
    details: { throughput_rps: 420, source_type: 'PostgreSQL CRM/ERP' },
  },
  {
    event_id: 'evt_demo_bronze_raw',
    pipeline_id: 'pipe_spark_ingest',
    node_id: 'bronze_raw',
    status: 'RUNNING',
    records_in: 7020,
    records_out: 7020,
    latency_ms: 22.0,
    timestamp: new Date().toISOString(),
    details: { iceberg_snapshot: 1042, throughput_rps: 3200 },
  },
  {
    event_id: 'evt_demo_silver_cleanse',
    pipeline_id: 'pipe_spark_silver',
    node_id: 'silver_cleansing',
    status: 'RUNNING',
    records_in: 7020,
    records_out: 7006,
    latency_ms: 48.0,
    timestamp: new Date().toISOString(),
    details: { quarantined_records: 14, throughput_rps: 4500 },
  },
  {
    event_id: 'evt_demo_guardian',
    pipeline_id: 'pipe_guardian_resilience',
    node_id: 'guardian_monitor',
    status: 'AUTO_HEALING',
    records_in: 14,
    records_out: 14,
    latency_ms: 15.0,
    timestamp: new Date().toISOString(),
    details: {
      quarantined_records: 14,
      playbook_id: 'PB-03-QUARANTINE',
      action_taken: 'Desviando 14 transacciones con montos negativos (F3) a cuarentena',
      anomaly_type: 'F3_NEGATIVE_AMOUNT',
    },
  },
  {
    event_id: 'evt_demo_gold_marts',
    pipeline_id: 'pipe_spark_gold',
    node_id: 'gold_marts',
    status: 'HEALTHY',
    records_in: 7006,
    records_out: 7006,
    latency_ms: 35.0,
    timestamp: new Date().toISOString(),
    details: { iceberg_snapshot: 2042, throughput_rps: 5200, quality_score: 1.0 },
  },
];

export async function GET(req: NextRequest) {
  const isMockEnabled = process.env.NEXT_PUBLIC_MOCK_SSE === 'true';

  // Si no se solicita explícitamente el mock con NEXT_PUBLIC_MOCK_SSE=true,
  // se delega la transmisión al Gateway canónico FastAPI (src/api/routes/telemetry.py).
  if (!isMockEnabled) {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const upstreamUrl = `${backendUrl}/api/v1/telemetry/stream${req.nextUrl.search}`;
    try {
      const upstreamRes = await fetch(upstreamUrl, {
        headers: {
          Accept: 'text/event-stream',
          ...(req.headers.get('last-event-id') ? { 'last-event-id': req.headers.get('last-event-id')! } : {}),
          ...(req.headers.get('x-user-role') ? { 'x-user-role': req.headers.get('x-user-role')! } : {}),
        },
      });

      if (!upstreamRes.ok || !upstreamRes.body) {
        return new Response('Backend telemetry stream unavailable', { status: upstreamRes.status || 502 });
      }

      return new Response(upstreamRes.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    } catch {
      return new Response('Backend telemetry gateway unreachable', { status: 502 });
    }
  }

  const encoder = new TextEncoder();
  const searchParams = req.nextUrl.searchParams;
  const lastEventId = searchParams.get('last_event_id') || req.headers.get('last-event-id');

  let intervalId: NodeJS.Timeout | null = null;
  let pingId: NodeJS.Timeout | null = null;
  let stepIndex = 0;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Si se reconectó con last_event_id, enviar confirmación en keepalive
      if (lastEventId) {
        controller.enqueue(
          encoder.encode(`: reconnected after ${lastEventId}\n\n`)
        );
      }

      // 2. Enviar ráfaga inicial de eventos para activar la topología
      for (const initialEvt of CANONICAL_FLOW) {
        const payload = JSON.stringify({
          ...initialEvt,
          timestamp: new Date().toISOString(),
        });
        controller.enqueue(
          encoder.encode(`id: ${initialEvt.event_id}\nevent: telemetry\ndata: ${payload}\n\n`)
        );
      }

      // 3. Intervalo de streaming continuo en caliente (cada 2.5 segundos)
      intervalId = setInterval(() => {
        try {
          const baseEvt = CANONICAL_FLOW[stepIndex % CANONICAL_FLOW.length];
          stepIndex++;

          // Generar variaciones de flujo reales
          const variance = Math.floor(Math.random() * 500) - 250;
          const currentRps = Math.max(200, (baseEvt.details?.throughput_rps as number || 1000) + variance);
          const currentOut = Math.max(10, baseEvt.records_out + variance);

          const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const eventPayload = {
            ...baseEvt,
            event_id: eventId,
            records_out: currentOut,
            timestamp: new Date().toISOString(),
            details: {
              ...baseEvt.details,
              throughput_rps: currentRps,
            },
          };

          const sseData = `id: ${eventId}\nevent: telemetry\ndata: ${JSON.stringify(eventPayload)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        } catch {
          // Stream cerrado por el cliente
          if (intervalId) clearInterval(intervalId);
          if (pingId) clearInterval(pingId);
        }
      }, 2500);

      // 4. Keepalive heartbeat cada 15 segundos
      pingId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          if (intervalId) clearInterval(intervalId);
          if (pingId) clearInterval(pingId);
        }
      }, 15000);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
      if (pingId) clearInterval(pingId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
