/**
 * Unit tests for useTimeTravel hook (HU-FRONT-03)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeTravel } from '../hooks/useTimeTravel';
import { HistoricalSnapshotStore } from '../services/historicalTelemetryService';
import { TelemetryEventPayload } from '../types/telemetry';

describe('useTimeTravel hook', () => {
  let mockStore: HistoricalSnapshotStore;
  const mockNow = 1774000000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockNow);
    mockStore = new HistoricalSnapshotStore();
    mockStore.initialize(mockNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. Initialises in LIVE mode by default with isPlaying false and speed 1x', () => {
    const { result } = renderHook(() =>
      useTimeTravel({
        store: mockStore,
      })
    );

    expect(result.current.mode).toBe('LIVE');
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.speed).toBe(1);
    expect(result.current.relativeOffsetMinutes).toBe(0);
    expect(result.current.relativeOffsetLabel).toBe('LIVE');
    expect(result.current.currentTimeMs).toBe(mockNow);
  });

  it('2. Seeking to 45 minutes ago switches to REPLAY mode and updates T-45m badge', () => {
    const { result } = renderHook(() =>
      useTimeTravel({
        store: mockStore,
      })
    );

    act(() => {
      result.current.seekRelativeMinutes(45);
    });

    expect(result.current.mode).toBe('REPLAY');
    expect(result.current.relativeOffsetMinutes).toBe(45);
    expect(result.current.relativeOffsetLabel).toBe('T-45m');
    expect(result.current.activeSnapshot?.scenarioId).toBe('T1');
  });

  it('3. Formats multi-hour offsets cleanly (e.g. T-2h, T-2h 15m)', () => {
    const { result } = renderHook(() =>
      useTimeTravel({
        store: mockStore,
      })
    );

    act(() => {
      result.current.seekRelativeMinutes(120);
    });

    expect(result.current.mode).toBe('REPLAY');
    expect(result.current.relativeOffsetLabel).toBe('T-2h');

    act(() => {
      result.current.seekRelativeMinutes(135);
    });

    expect(result.current.relativeOffsetLabel).toBe('T-2h 15m');
  });

  it('4. returnToLive() restores LIVE mode and real-time synchronization', () => {
    const { result } = renderHook(() =>
      useTimeTravel({
        store: mockStore,
      })
    );

    // Scrub back
    act(() => {
      result.current.seekRelativeMinutes(60);
    });
    expect(result.current.mode).toBe('REPLAY');

    // Click return to LIVE
    act(() => {
      result.current.returnToLive();
    });

    expect(result.current.mode).toBe('LIVE');
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.relativeOffsetMinutes).toBe(0);
    expect(result.current.relativeOffsetLabel).toBe('LIVE');
  });

  it('5. Controls playback: play advances time in REPLAY mode, pause halts advance', () => {
    const { result } = renderHook(() =>
      useTimeTravel({
        store: mockStore,
        tickIntervalMs: 100,
        timelineSpeedMultiplier: 10,
      })
    );

    // Seek to 30 min ago
    act(() => {
      result.current.seekRelativeMinutes(30);
    });
    const timeBeforePlay = result.current.currentTimeMs;

    // Start play
    act(() => {
      result.current.play();
    });
    expect(result.current.isPlaying).toBe(true);

    // Advance 500ms real time (5 ticks)
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.currentTimeMs).toBeGreaterThan(timeBeforePlay);

    // Pause
    act(() => {
      result.current.pause();
    });
    expect(result.current.isPlaying).toBe(false);
    const timeAfterPause = result.current.currentTimeMs;

    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Time must remain halted while paused
    expect(result.current.currentTimeMs).toBe(timeAfterPause);
  });

  it('6. Supports speeds 1x, 2x, 5x', () => {
    const { result } = renderHook(() =>
      useTimeTravel({
        store: mockStore,
      })
    );

    act(() => {
      result.current.setSpeed(2);
    });
    expect(result.current.speed).toBe(2);

    act(() => {
      result.current.setSpeed(5);
    });
    expect(result.current.speed).toBe(5);

    act(() => {
      result.current.setSpeed(1);
    });
    expect(result.current.speed).toBe(1);
  });

  it('7. Buffers live telemetry events in background during REPLAY without losing history', () => {
    const { result } = renderHook(() =>
      useTimeTravel({
        store: mockStore,
      })
    );

    // Move to REPLAY
    act(() => {
      result.current.seekRelativeMinutes(25);
    });
    expect(result.current.mode).toBe('REPLAY');
    const replaySnapshotId = result.current.activeSnapshot?.id;

    // Live event arrives
    const liveEvt: TelemetryEventPayload = {
      event_id: 'live_test_bg_01',
      pipeline_id: 'pipe_medallion_e2e',
      node_id: 'gold_marts',
      status: 'HEALTHY',
      records_in: 9999,
      records_out: 9999,
      latency_ms: 10,
      timestamp: new Date().toISOString(),
    };

    act(() => {
      result.current.recordLiveTelemetry(liveEvt);
    });

    // REPLAY active snapshot stays pinned to historical point
    expect(result.current.mode).toBe('REPLAY');
    expect(result.current.activeSnapshot?.id).toBe(replaySnapshotId);

    // When returning to LIVE, latest live event is reflected
    act(() => {
      result.current.returnToLive();
    });
    expect(result.current.mode).toBe('LIVE');
    expect(result.current.activeSnapshot?.nodesState.gold_marts.recordsOut).toBe(9999);
  });
});
