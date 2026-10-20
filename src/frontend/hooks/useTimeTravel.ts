'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  TimeTravelMode,
  ReplaySpeed,
  PipelineSnapshot,
  HistoricalTimelinePoint,
  formatRelativeOffsetLabel,
} from '@/types/timeTravel';
import {
  HistoricalSnapshotStore,
  historicalSnapshotStore as defaultStore,
} from '@/services/historicalTelemetryService';
import { TelemetryEventPayload } from '@/types/telemetry';

export interface UseTimeTravelOptions {
  store?: HistoricalSnapshotStore;
  initialMode?: TimeTravelMode;
  initialSpeed?: ReplaySpeed;
  windowHours?: number;
  onSnapshotChange?: (snapshot: PipelineSnapshot | null) => void;
  onModeChange?: (mode: TimeTravelMode) => void;
  /**
   * Optional tick interval in ms for replay animation. Defaults to 250ms.
   */
  tickIntervalMs?: number;
  /**
   * Replay speed multiplier. At 60x, 1 real second = 1 replay minute at 1x speed.
   */
  timelineSpeedMultiplier?: number;
}

export interface UseTimeTravelReturn {
  mode: TimeTravelMode;
  isPlaying: boolean;
  speed: ReplaySpeed;
  currentTimeMs: number;
  liveNowMs: number;
  windowStartMs: number;
  windowEndMs: number;
  activeSnapshot: PipelineSnapshot | null;
  relativeOffsetMinutes: number;
  relativeOffsetLabel: string;
  availableSnapshots: PipelineSnapshot[];
  timelinePoints: HistoricalTimelinePoint[];
  // Controls
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  seekTo: (targetMs: number) => void;
  seekRelativeMinutes: (minutesAgo: number) => void;
  returnToLive: () => void;
  recordLiveTelemetry: (event: TelemetryEventPayload) => void;
}

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_TICK_INTERVAL_MS = 250;
const DEFAULT_TIMELINE_MULTIPLIER = 60; // 1 second real time = 60 seconds of timeline at 1x

export function useTimeTravel(options: UseTimeTravelOptions = {}): UseTimeTravelReturn {
  const {
    store = defaultStore,
    initialMode = 'LIVE',
    initialSpeed = 1,
    windowHours = DEFAULT_WINDOW_HOURS,
    onSnapshotChange,
    onModeChange,
    tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
    timelineSpeedMultiplier = DEFAULT_TIMELINE_MULTIPLIER,
  } = options;

  const [mode, setMode] = useState<TimeTravelMode>(initialMode);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(initialSpeed);

  // Live real-time baseline (clock anchor)
  const [liveNowMs, setLiveNowMs] = useState<number>(() => Date.now());
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(() => Date.now());

  // Store snapshots version tracker to trigger re-renders when live events are recorded
  const [snapshotsVersion, setSnapshotsVersion] = useState<number>(0);

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const speedRef = useRef(speed);
  speedRef.current = speed;

  const currentTimeRef = useRef(currentTimeMs);
  currentTimeRef.current = currentTimeMs;

  const liveNowRef = useRef(liveNowMs);
  liveNowRef.current = liveNowMs;

  // Window boundaries
  const windowDurationMs = windowHours * 60 * 60 * 1000;
  const windowStartMs = liveNowMs - windowDurationMs;
  const windowEndMs = liveNowMs;

  // Sync mode changes with callback
  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  // LIVE clock synchronization tick (every 1 second)
  useEffect(() => {
    const liveInterval = setInterval(() => {
      const now = Date.now();
      setLiveNowMs(now);

      if (modeRef.current === 'LIVE') {
        setCurrentTimeMs(now);
      }
    }, 1000);

    return () => clearInterval(liveInterval);
  }, []);

  // REPLAY playback animation loop
  useEffect(() => {
    if (!isPlaying || mode !== 'REPLAY') {
      return;
    }

    const interval = setInterval(() => {
      setCurrentTimeMs((prevTime) => {
        // Calculate advance: tickIntervalMs * speed * multiplier
        const advanceMs = tickIntervalMs * speedRef.current * timelineSpeedMultiplier;
        const nextTime = prevTime + advanceMs;

        // If reached or exceeded live time, pause at the edge
        if (nextTime >= liveNowRef.current) {
          setIsPlaying(false);
          return liveNowRef.current;
        }

        return nextTime;
      });
    }, tickIntervalMs);

    return () => clearInterval(interval);
  }, [isPlaying, mode, tickIntervalMs, timelineSpeedMultiplier]);

  // Calculate active snapshot
  const activeSnapshot = useMemo(() => {
    // Suppress unused warning for snapshotsVersion dependency
    void snapshotsVersion;
    if (mode === 'LIVE') {
      // In LIVE mode, point to the latest recorded snapshot
      const all = store.getAllSnapshots();
      return all.length > 0 ? all[all.length - 1] : null;
    }
    return store.findNearestSnapshot(currentTimeMs);
  }, [store, currentTimeMs, mode, snapshotsVersion]);

  // Notify on active snapshot change
  const lastEmittedSnapshotId = useRef<string | null>(null);
  useEffect(() => {
    if (activeSnapshot && activeSnapshot.id !== lastEmittedSnapshotId.current) {
      lastEmittedSnapshotId.current = activeSnapshot.id;
      onSnapshotChange?.(activeSnapshot);
    }
  }, [activeSnapshot, onSnapshotChange]);

  // Relative offset calculations
  const relativeOffsetMinutes = useMemo(() => {
    if (mode === 'LIVE') {
      return 0;
    }
    const diffMs = Math.max(0, liveNowMs - currentTimeMs);
    return Math.round(diffMs / (60 * 1000));
  }, [mode, liveNowMs, currentTimeMs]);

  const relativeOffsetLabel = useMemo(() => {
    if (mode === 'LIVE') {
      return 'LIVE';
    }
    return formatRelativeOffsetLabel(relativeOffsetMinutes);
  }, [mode, relativeOffsetMinutes]);

  // Playback control actions
  const play = useCallback(() => {
    if (mode === 'LIVE') {
      // If pressing play in LIVE mode, rewind to 45m ago (T1 incident) or windowStart
      setMode('REPLAY');
      const startMs = Math.max(windowStartMs, liveNowMs - 45 * 60 * 1000);
      setCurrentTimeMs(startMs);
    }
    setIsPlaying(true);
  }, [mode, windowStartMs, liveNowMs]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const handleSetSpeed = useCallback((newSpeed: ReplaySpeed) => {
    setSpeed(newSpeed);
  }, []);

  const seekTo = useCallback(
    (targetMs: number) => {
      const now = liveNowRef.current;
      const minMs = now - windowDurationMs;
      const clamped = Math.max(minMs, Math.min(now, targetMs));

      // If user scrubbed within 30 seconds of LIVE, return to LIVE mode
      if (now - clamped <= 30 * 1000) {
        setMode('LIVE');
        setIsPlaying(false);
        setCurrentTimeMs(now);
      } else {
        setMode('REPLAY');
        setCurrentTimeMs(clamped);
      }
    },
    [windowDurationMs]
  );

  const seekRelativeMinutes = useCallback(
    (minutesAgo: number) => {
      const targetMs = liveNowRef.current - minutesAgo * 60 * 1000;
      seekTo(targetMs);
    },
    [seekTo]
  );

  const returnToLive = useCallback(() => {
    const now = Date.now();
    setLiveNowMs(now);
    setCurrentTimeMs(now);
    setIsPlaying(false);
    setMode('LIVE');
  }, []);

  const recordLiveTelemetry = useCallback(
    (event: TelemetryEventPayload) => {
      const now = Date.now();
      store.recordLiveEvent(event, now);
      setSnapshotsVersion((v) => v + 1);

      if (modeRef.current === 'LIVE') {
        setLiveNowMs(now);
        setCurrentTimeMs(now);
      }
    },
    [store]
  );

  const availableSnapshots = useMemo(() => {
    void snapshotsVersion;
    return store.getAllSnapshots();
  }, [store, snapshotsVersion]);

  const timelinePoints = useMemo(() => {
    void snapshotsVersion;
    return store.getTimelinePoints();
  }, [store, snapshotsVersion]);

  return {
    mode,
    isPlaying,
    speed,
    currentTimeMs,
    liveNowMs,
    windowStartMs,
    windowEndMs,
    activeSnapshot,
    relativeOffsetMinutes,
    relativeOffsetLabel,
    availableSnapshots,
    timelinePoints,
    play,
    pause,
    togglePlay,
    setSpeed: handleSetSpeed,
    seekTo,
    seekRelativeMinutes,
    returnToLive,
    recordLiveTelemetry,
  };
}
