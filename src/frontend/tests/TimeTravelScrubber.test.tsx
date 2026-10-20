/**
 * Unit tests for TimeTravelScrubber component (HU-FRONT-03)
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeTravelScrubber, TimeTravelScrubberProps } from '../components/canvas/TimeTravelScrubber';
import { createCanonicalSnapshots } from '../services/historicalTelemetryService';

describe('TimeTravelScrubber component', () => {
  const fixedNow = 1774000000000;
  const snapshots = createCanonicalSnapshots(fixedNow);
  const liveSnapshot = snapshots[snapshots.length - 1];
  const t1Snapshot = snapshots.find((s) => s.scenarioId === 'T1')!;

  const baseProps: TimeTravelScrubberProps = {
    mode: 'LIVE',
    isPlaying: false,
    speed: 1,
    currentTimeMs: fixedNow,
    liveNowMs: fixedNow,
    windowStartMs: fixedNow - 24 * 3600 * 1000,
    windowEndMs: fixedNow,
    activeSnapshot: liveSnapshot,
    relativeOffsetMinutes: 0,
    relativeOffsetLabel: 'LIVE',
    timelinePoints: snapshots.map((s) => ({
      id: s.id,
      timestamp: s.timestamp,
      timestampMs: s.timestampMs,
      label: s.stageLabel,
      status: s.overallStatus,
      scenarioId: s.scenarioId,
    })),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onTogglePlay: vi.fn(),
    onSetSpeed: vi.fn(),
    onSeek: vi.fn(),
    onReturnToLive: vi.fn(),
  };

  it('1. Renders in LIVE mode with LIVE badge and hides Return to Live button (AC-02)', () => {
    render(<TimeTravelScrubber {...baseProps} />);

    expect(screen.getByTestId('live-badge')).toBeInTheDocument();
    expect(screen.getByText(/MODO EN VIVO \(LIVE\)/i)).toBeInTheDocument();
    expect(screen.queryByTestId('return-to-live-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId('scrubber-timestamp')).toBeInTheDocument();
  });

  it('2. Renders in REPLAY mode with historical badge T-45m and Return to Live button (AC-04)', () => {
    const replayProps: TimeTravelScrubberProps = {
      ...baseProps,
      mode: 'REPLAY',
      currentTimeMs: fixedNow - 45 * 60 * 1000,
      activeSnapshot: t1Snapshot,
      relativeOffsetMinutes: 45,
      relativeOffsetLabel: 'T-45m',
    };

    render(<TimeTravelScrubber {...replayProps} />);

    const badge = screen.getByTestId('historical-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/MODO REPLAY HISTÓRICO - T-45m/i);

    const returnBtn = screen.getByTestId('return-to-live-btn');
    expect(returnBtn).toBeInTheDocument();
    fireEvent.click(returnBtn);
    expect(baseProps.onReturnToLive).toHaveBeenCalledTimes(1);
  });

  it('3. Renders multi-hour badge T-2h 15m accurately (AC-04)', () => {
    const multiHourProps: TimeTravelScrubberProps = {
      ...baseProps,
      mode: 'REPLAY',
      currentTimeMs: fixedNow - 135 * 60 * 1000,
      activeSnapshot: snapshots[2],
      relativeOffsetMinutes: 135,
      relativeOffsetLabel: 'T-2h 15m',
    };

    render(<TimeTravelScrubber {...multiHourProps} />);

    const badge = screen.getByTestId('historical-badge');
    expect(badge).toHaveTextContent(/MODO REPLAY HISTÓRICO - T-2h 15m/i);
  });

  it('4. Handles Play/Pause button toggle (AC-01)', () => {
    const onTogglePlay = vi.fn();
    const { rerender } = render(
      <TimeTravelScrubber {...baseProps} isPlaying={false} onTogglePlay={onTogglePlay} />
    );

    const playBtn = screen.getByTestId('play-pause-btn');
    expect(playBtn).toHaveAttribute('aria-label', 'Iniciar reproducción histórica');
    fireEvent.click(playBtn);
    expect(onTogglePlay).toHaveBeenCalledTimes(1);

    // Re-render when isPlaying is true
    rerender(<TimeTravelScrubber {...baseProps} isPlaying={true} onTogglePlay={onTogglePlay} />);
    const pauseBtn = screen.getByTestId('play-pause-btn');
    expect(pauseBtn).toHaveAttribute('aria-label', 'Pausar reproducción');
  });

  it('5. Handles speed selection buttons 1x, 2x, 5x (AC-01)', () => {
    const onSetSpeed = vi.fn();
    render(<TimeTravelScrubber {...baseProps} speed={1} onSetSpeed={onSetSpeed} />);

    const btn2x = screen.getByTestId('speed-btn-2x');
    const btn5x = screen.getByTestId('speed-btn-5x');

    fireEvent.click(btn2x);
    expect(onSetSpeed).toHaveBeenCalledWith(2);

    fireEvent.click(btn5x);
    expect(onSetSpeed).toHaveBeenCalledWith(5);
  });

  it('6. Handles slider scrubbing and scenario pills (AC-01, AC-03)', () => {
    const onSeek = vi.fn();
    render(<TimeTravelScrubber {...baseProps} onSeek={onSeek} />);

    const slider = screen.getByRole('slider', { name: /línea de tiempo de 24 horas/i });
    const targetMs = fixedNow - 10 * 3600 * 1000;
    fireEvent.change(slider, { target: { value: String(targetMs) } });
    expect(onSeek).toHaveBeenCalledWith(targetMs);

    // Scenario bookmark pill
    const pillT1 = screen.getByTestId('scenario-pill-T1');
    fireEvent.click(pillT1);
    expect(onSeek).toHaveBeenCalledWith(t1Snapshot.timestampMs);
  });
});
