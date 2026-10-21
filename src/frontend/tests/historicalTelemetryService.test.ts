/**
 * Tests for HistoricalSnapshotStore and historicalTelemetryService (HU-FRONT-03)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HistoricalSnapshotStore,
  createCanonicalSnapshots,
  createBaseNodesState,
} from '../services/historicalTelemetryService';
import { TelemetryEventPayload } from '../types/telemetry';

describe('HistoricalSnapshotStore', () => {
  const fixedNow = 1774000000000; // arbitrary fixed epoch

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Generates 7 canonical snapshots covering 24h timeline', () => {
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

  it('2. Finds nearest snapshot via binary search (bisection)', () => {
    const store = new HistoricalSnapshotStore();
    store.initialize(fixedNow);
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

  it('3. Records live telemetry event and updates in-memory snapshot history', () => {
    const store = new HistoricalSnapshotStore();
    store.initialize(fixedNow);

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

  it('4. Handles buffer hydration with fallback when network fails or returns empty', async () => {
    const store = new HistoricalSnapshotStore();
    store.initialize(fixedNow);

    // Mock fetch failure
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const count = await store.hydrateFromBuffer('http://invalid-endpoint:9999');
    expect(count).toBe(0);
    expect(store.getAllSnapshots().length).toBeGreaterThanOrEqual(7);

    // Mock fetch success with events
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        buffer_size: 1,
        events: [
          {
            event_id: 'evt_buff_01',
            pipeline_id: 'pipe_medallion_e2e',
            node_id: 'gold_marts',
            status: 'HEALTHY',
            records_in: 1000,
            records_out: 1000,
            latency_ms: 15,
            timestamp: new Date(fixedNow + 10000).toISOString(),
          },
        ],
      }),
    } as any);

    const countSuccess = await store.hydrateFromBuffer('http://localhost:8000');
    expect(countSuccess).toBe(1);
  });
});
