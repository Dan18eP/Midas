/**
 * Tests for HistoricalSnapshotStore and historicalTelemetryService (HU-FRONT-03 + HU-FRONT-08).
 *
 * HU-FRONT-08: el store de producción **no fabrica** snapshots. La línea de tiempo
 * se hidrata desde `GET /api/v1/telemetry/history` y los hitos T0–T3 desde
 * `GET /api/v1/telemetry/scenarios/{id}`. `createCanonicalSnapshots()` queda
 * exclusivamente como fixture de pruebas.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HistoricalSnapshotStore,
  createCanonicalSnapshots,
  createBaseNodesState,
  historicalSnapshotStore,
} from '../services/historicalTelemetryService';
import { TelemetryEventPayload } from '../types/telemetry';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

const HISTORY_EVENTS = [
  {
    event_id: 'evt_hist_01',
    pipeline_id: 'pipe_medallion_e2e',
    node_id: 'source_postgres',
    status: 'HEALTHY',
    records_in: 0,
    records_out: 5000,
    latency_ms: 15,
    timestamp: '2026-10-20T10:00:00.000Z',
    details: { throughput_rps: 350 },
  },
  {
    event_id: 'evt_hist_02',
    pipeline_id: 'pipe_medallion_e2e',
    node_id: 'silver_cleansing',
    status: 'DEGRADED',
    records_in: 5000,
    records_out: 4986,
    latency_ms: 95,
    timestamp: '2026-10-20T10:05:00.000Z',
    details: { quarantined_records: 14, anomaly_type: 'F3_NEGATIVE_AMOUNT' },
  },
];

const HISTORY_PAYLOAD = {
  window: '24h',
  total_events: HISTORY_EVENTS.length,
  events: HISTORY_EVENTS,
  nodes_summary: {
    source_postgres: {
      status: 'HEALTHY',
      records_in: 0,
      records_out: 5000,
      latency_ms: 15,
      last_event_id: 'evt_hist_01',
    },
  },
  active_alerts_count: 1,
  retrieved_at: '2026-10-20T10:06:00.000Z',
};

describe('HistoricalSnapshotStore', () => {
  const fixedNow = 1774000000000; // arbitrary fixed epoch

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Genera 7 snapshots canónicos cubriendo la línea de 24h (fixture de pruebas)', () => {
    const snapshots = createCanonicalSnapshots(fixedNow);
    expect(snapshots).toHaveLength(7);

    // Verify ordering
    for (let i = 0; i < snapshots.length - 1; i++) {
      expect(snapshots[i].timestampMs).toBeLessThanOrEqual(snapshots[i + 1].timestampMs);
    }

    // Verify scenarios
    const scenarioIds = snapshots.map((s) => s.scenarioId);
    expect(scenarioIds).toContain('T0');
    expect(scenarioIds).toContain('T1');
    expect(scenarioIds).toContain('T2');
    expect(scenarioIds).toContain('T3');

    // Verify T1 has degraded Silver node and quarantined records
    const snapT1 = snapshots.find((s) => s.scenarioId === 'T1');
    expect(snapT1).toBeDefined();
    expect(snapT1?.nodesState.silver_cleansing.status).toBe('DEGRADED');
    expect(snapT1?.nodesState.silver_cleansing.quarantinedRecords).toBe(14);
    expect(snapT1?.activeAlerts).toHaveLength(1);
    expect(snapT1?.activeAlerts[0].message).toContain('F3_NEGATIVE_AMOUNT');

    // Verify T2 has AUTO_HEALING Guardian
    const snapT2 = snapshots.find((s) => s.scenarioId === 'T2');
    expect(snapT2).toBeDefined();
    expect(snapT2?.nodesState.guardian_monitor.status).toBe('AUTO_HEALING');
    expect(snapT2?.nodesState.guardian_monitor.guardianDetails?.playbook_id).toBe('PB-03-QUARANTINE');

    // Verify T3 has HEALTHY nodes and Iceberg 2002 details
    const snapT3 = snapshots.find((s) => s.scenarioId === 'T3');
    expect(snapT3).toBeDefined();
    expect(snapT3?.nodesState.silver_cleansing.status).toBe('HEALTHY');
    expect(snapT3?.nodesState.gold_marts.status).toBe('HEALTHY');
  });

  it('2. Encuentra el snapshot más cercano mediante búsqueda binaria (bisección)', () => {
    const store = new HistoricalSnapshotStore();
    store.seedCanonicalScenarios(fixedNow);
    const snapshots = store.getAllSnapshots();

    // Boundary: before earliest
    const earliest = store.findNearestSnapshot(fixedNow - 30 * 3600 * 1000);
    expect(earliest?.id).toBe(snapshots[0].id);

    // Boundary: at latest
    const latest = store.findNearestSnapshot(fixedNow + 1000);
    expect(latest?.id).toBe(snapshots[snapshots.length - 1].id);

    // Mid point: around T1 (-45 min)
    const t45m = fixedNow - 45 * 60 * 1000;
    const snapAtT1 = store.findNearestSnapshot(t45m);
    expect(snapAtT1?.scenarioId).toBe('T1');

    // Between T1 and T2: should pick T1 (largest <= targetMs)
    const betweenT1andT2 = fixedNow - 35 * 60 * 1000;
    const snapBetween = store.findNearestSnapshot(betweenT1andT2);
    expect(snapBetween?.scenarioId).toBe('T1');
  });

  it('3. Registra un evento de telemetría en vivo y actualiza el historial en memoria', () => {
    const store = new HistoricalSnapshotStore();
    store.seedCanonicalScenarios(fixedNow);

    const event: TelemetryEventPayload = {
      event_id: 'evt_test_01',
      pipeline_id: 'pipe_medallion_e2e',
      node_id: 'silver_cleansing',
      status: 'DEGRADED',
      records_in: 500,
      records_out: 480,
      latency_ms: 110,
      timestamp: new Date(fixedNow + 5000).toISOString(),
      details: {
        quarantined_records: 20,
        anomaly_type: 'F3_NEGATIVE_AMOUNT',
      },
    };

    const recorded = store.recordLiveEvent(event, fixedNow + 5000);
    expect(recorded.overallStatus).toBe('DEGRADED');
    expect(recorded.nodesState.silver_cleansing.quarantinedRecords).toBe(20);
    expect(recorded.nodesState.silver_cleansing.status).toBe('DEGRADED');

    const retrieved = store.findNearestSnapshot(fixedNow + 5000);
    expect(retrieved?.id).toBe(recorded.id);
  });

  // ---------------------------------------------------------------------------
  // HU-FRONT-08 — Desmockitización del Time-Travel Replay
  // ---------------------------------------------------------------------------

  it('4. El store de producción NO fabrica snapshots al construirse', () => {
    const store = new HistoricalSnapshotStore();

    expect(store.getAllSnapshots()).toHaveLength(0);
    expect(store.getTimelinePoints()).toHaveLength(0);
    expect(store.getHistoryStatus()).toBe('idle');
    expect(store.getHistoryError()).toBeNull();

    // El singleton compartido tampoco se autosiembra con datos ficticios.
    expect(historicalSnapshotStore.getAllSnapshots()).toHaveLength(0);
  });

  it('5. hydrateFromHistory consume GET /api/v1/telemetry/history y puebla la línea de tiempo', async () => {
    const store = new HistoricalSnapshotStore();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(HISTORY_PAYLOAD));

    const loaded = await store.hydrateFromHistory({ fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(loaded).toBe(2);
    expect(store.getHistoryStatus()).toBe('ready');
    expect(store.getHistoryError()).toBeNull();

    const requestedUrl = String(fetchImpl.mock.calls[0][0]);
    expect(requestedUrl).toContain('/api/v1/telemetry/history');
    expect(requestedUrl).toContain('window=24h');

    const snapshots = store.getAllSnapshots();
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].id).toBe('hist_evt_hist_01');
    expect(snapshots[0].nodesState.source_postgres.recordsOut).toBe(5000);
    expect(snapshots[1].nodesState.silver_cleansing.quarantinedRecords).toBe(14);
    expect(snapshots[1].overallStatus).toBe('DEGRADED');
  });

  it('6. hydrateFromHistory con historial vacío deja el estado "empty" sin lanzar', async () => {
    const store = new HistoricalSnapshotStore();
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ ...HISTORY_PAYLOAD, total_events: 0, events: [] }),
    );

    const loaded = await store.hydrateFromHistory({ fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(loaded).toBe(0);
    expect(store.getHistoryStatus()).toBe('empty');
    expect(store.getHistoryError()).toBeNull();
    expect(store.getAllSnapshots()).toHaveLength(0);
  });

  it('7. hydrateFromHistory con error del Gateway deja el estado "error" sin lanzar', async () => {
    const store = new HistoricalSnapshotStore();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Network error'));

    const loaded = await store.hydrateFromHistory({ fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(loaded).toBe(0);
    expect(store.getHistoryStatus()).toBe('error');
    expect(store.getHistoryError()).toContain('no está disponible');
    expect(store.getAllSnapshots()).toHaveLength(0);
  });

  it('8. hydrateScenarioAnchors ancla los hitos T0–T3 publicados por el backend', async () => {
    const store = new HistoricalSnapshotStore();
    const scenarioEvents = [
      {
        event_id: 'evt_t1_slv_02',
        pipeline_id: 'pipe_medallion_e2e',
        node_id: 'silver_cleansing',
        status: 'DEGRADED',
        records_in: 1200,
        records_out: 1186,
        latency_ms: 95,
        timestamp: '2026-10-20T10:00:00.000Z',
        details: { quarantined_records: 14, anomaly_type: 'F3_NEGATIVE_AMOUNT' },
      },
    ];
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      const scenarioId = String(url).split('/').pop();
      if (scenarioId === 'T1') {
        return jsonResponse({
          scenario_id: 'T1',
          event_count: scenarioEvents.length,
          events: scenarioEvents,
        });
      }
      return jsonResponse({ scenario_id: scenarioId, event_count: 0, events: [] });
    });

    const loaded = await store.hydrateScenarioAnchors({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      referenceNowMs: fixedNow,
    });

    expect(loaded).toBe(1);
    const points = store.getTimelinePoints();
    expect(points).toHaveLength(1);
    expect(points[0].scenarioId).toBe('T1');
    expect(points[0].timestampMs).toBe(fixedNow - 45 * 60 * 1000);
    expect(points[0].label).toContain('Escenario T1');
  });

  it('9. hydrateScenarioAnchors tolera un escenario no disponible sin abortar el resto', async () => {
    const store = new HistoricalSnapshotStore();
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      const scenarioId = String(url).split('/').pop();
      if (scenarioId === 'T0') {
        return jsonResponse({ scenario_id: 'T0', event_count: 0, events: [] });
      }
      return jsonResponse({ detail: 'escenario no disponible' }, false, 404);
    });

    const loaded = await store.hydrateScenarioAnchors({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      referenceNowMs: fixedNow,
    });

    expect(loaded).toBe(0);
    expect(store.getAllSnapshots()).toHaveLength(0);
  });

  it('10. createBaseNodesState permanece disponible como fixture de pruebas', () => {
    const base = createBaseNodesState();
    expect(Object.keys(base)).toHaveLength(7);
    expect(base.silver_cleansing.status).toBe('HEALTHY');
  });
});
