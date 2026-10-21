'use client';

import React, { memo, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  Radio,
  Clock,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import {
  TimeTravelMode,
  ReplaySpeed,
  REPLAY_SPEEDS,
  CANONICAL_SCENARIO_IDS,
  PipelineSnapshot,
  HistoricalTimelinePoint,
} from '@/types/timeTravel';

export interface TimeTravelScrubberProps {
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
  timelinePoints?: HistoricalTimelinePoint[];
  onPlay: () => void;
  onPause: () => void;
  onTogglePlay: () => void;
  onSetSpeed: (speed: ReplaySpeed) => void;
  onSeek: (targetMs: number) => void;
  onReturnToLive: () => void;
  className?: string;
}

/**
 * Format timestamp into Spanish localized date and time representation.
 */
function formatDateTime(timestampMs: number): string {
  try {
    const d = new Date(timestampMs);
    return d.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return new Date(timestampMs).toISOString();
  }
}

export const TimeTravelScrubber: React.FC<TimeTravelScrubberProps> = memo(({
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
  timelinePoints = [],
  onPlay,
  onPause,
  onTogglePlay,
  onSetSpeed,
  onSeek,
  onReturnToLive,
  className = '',
}) => {
  // Format current display timestamp
  const displayTime = useMemo(() => formatDateTime(currentTimeMs), [currentTimeMs]);

  /**
   * Canonical milestone bookmarks for the quick-jump pills (AC-01).
   * The store keeps several snapshots per canonical scenario (T0 exists at T-24h, T-12h, T-2h
   * and LIVE), so pills are deduplicated by scenarioId keeping the most recent snapshot of
   * each one — for T0 that is the "En Vivo (LIVE)" reference, which seekTo maps back to LIVE mode.
   */
  const milestonePoints = useMemo(() => {
    const latestByScenario = new Map<string, HistoricalTimelinePoint>();

    for (const point of timelinePoints) {
      if (!point.scenarioId) continue;
      const current = latestByScenario.get(point.scenarioId);
      if (!current || point.timestampMs >= current.timestampMs) {
        latestByScenario.set(point.scenarioId, point);
      }
    }

    const scenarioRank = (scenarioId: string) => {
      const index = CANONICAL_SCENARIO_IDS.indexOf(scenarioId);
      return index === -1 ? CANONICAL_SCENARIO_IDS.length : index;
    };

    return Array.from(latestByScenario.entries())
      .map(([scenarioId, point]) => ({ scenarioId, point }))
      .sort((a, b) => {
        const rankDiff = scenarioRank(a.scenarioId) - scenarioRank(b.scenarioId);
        if (rankDiff !== 0) return rankDiff;
        return a.point.timestampMs - b.point.timestampMs;
      });
  }, [timelinePoints]);

  // Handle range slider scrub
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const targetMs = Number(e.target.value);
      onSeek(targetMs);
    },
    [onSeek]
  );

  // Calculate percentage of slider for styling track fill
  const sliderPercentage = useMemo(() => {
    const total = windowEndMs - windowStartMs;
    if (total <= 0) return 100;
    const progress = Math.max(0, Math.min(total, currentTimeMs - windowStartMs));
    return (progress / total) * 100;
  }, [currentTimeMs, windowStartMs, windowEndMs]);

  return (
    <section
      aria-label="Barra de Replay Temporal e Inspección Histórica"
      className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[96%] max-w-5xl rounded-xl border border-[#E8E4DC] bg-[#FFFFFF]/95 backdrop-blur-md px-4 py-3 shadow-md transition-all ${className}`}
    >
      {/* --- TOP ROW: Status Badges, Clock & Return to Live --- */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-[#F0EDE7]">
        {/* Left: Mode Badge */}
        <div className="flex items-center gap-2">
          {mode === 'LIVE' ? (
            <span
              data-testid="live-badge"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#4D7C0F]/10 text-[#4D7C0F] border border-[#4D7C0F]/30 shadow-xs"
            >
              <span className="w-2 h-2 rounded-full bg-[#4D7C0F] animate-pulse" />
              <span>MODO EN VIVO (LIVE)</span>
            </span>
          ) : (
            <span
              data-testid="historical-badge"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#B8860B]/10 text-[#8C6D1F] border border-[#D4AF37] shadow-xs"
            >
              <Radio className="w-3.5 h-3.5 text-[#B8860B] animate-pulse" aria-hidden="true" />
              <span>MODO REPLAY HISTÓRICO - {relativeOffsetLabel}</span>
            </span>
          )}

          {/* Active Snapshot Stage Summary */}
          {activeSnapshot && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[#787164] font-medium bg-[#F7F7F5] px-2 py-0.5 rounded border border-[#F0EDE7]">
              {activeSnapshot.overallStatus === 'DEGRADED' && (
                <AlertTriangle className="w-3 h-3 text-[#C86A43]" />
              )}
              {activeSnapshot.overallStatus === 'AUTO_HEALING' && (
                <ShieldAlert className="w-3 h-3 text-[#B8860B]" />
              )}
              {activeSnapshot.overallStatus === 'HEALTHY' && (
                <CheckCircle2 className="w-3 h-3 text-[#4D7C0F]" />
              )}
              <span>{activeSnapshot.stageLabel}</span>
            </span>
          )}
        </div>

        {/* Center: Timestamp Display */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-[#1C1E21] font-semibold bg-[#F7F7F5] px-3 py-1 rounded-md border border-[#F0EDE7]">
          <Clock className="w-3.5 h-3.5 text-[#787164]" aria-hidden="true" />
          <span data-testid="scrubber-timestamp">{displayTime}</span>
        </div>

        {/* Right: Return to Live or Mode Status */}
        <div className="flex items-center gap-2">
          {mode === 'REPLAY' ? (
            <button
              onClick={onReturnToLive}
              data-testid="return-to-live-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-[#4D7C0F] hover:bg-[#3F6212] text-white shadow-xs transition-colors cursor-pointer"
              title="Volver a la telemetría en tiempo real"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Volver a LIVE</span>
            </button>
          ) : (
            <span className="text-[11px] text-[#787164] font-mono">
              Sincronizado 24h
            </span>
          )}
        </div>
      </div>

      {/* --- MIDDLE ROW: Continuous 24h Slider & Incident Markers --- */}
      <div className="pt-2 pb-1">
        <div className="relative flex flex-col justify-center">
          {/* Custom Track Slider */}
          <input
            type="range"
            min={windowStartMs}
            max={windowEndMs}
            step={1000}
            value={currentTimeMs}
            onChange={handleSliderChange}
            aria-label="Línea de tiempo de 24 horas"
            className="w-full h-2 bg-[#F0EDE7] rounded-lg appearance-none cursor-pointer accent-[#B8860B] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
            style={{
              background: `linear-gradient(to right, #D4AF37 0%, #D4AF37 ${sliderPercentage}%, #F0EDE7 ${sliderPercentage}%, #F0EDE7 100%)`,
            }}
          />

          {/* Timeline Scenario Quick Markers */}
          <div className="relative w-full h-4 mt-1 pointer-events-none">
            {timelinePoints.map((point) => {
              const total = windowEndMs - windowStartMs;
              if (total <= 0) return null;
              const leftPercent = Math.max(
                0,
                Math.min(100, ((point.timestampMs - windowStartMs) / total) * 100)
              );

              let markerColor = 'bg-[#4D7C0F]';
              if (point.status === 'DEGRADED') markerColor = 'bg-[#C86A43]';
              if (point.status === 'AUTO_HEALING') markerColor = 'bg-[#D4AF37]';
              if (point.status === 'ERROR') markerColor = 'bg-[#A8422B]';

              return (
                <div
                  key={point.id}
                  style={{ left: `${leftPercent}%` }}
                  className="absolute top-0 -translate-x-1/2 flex flex-col items-center group pointer-events-auto cursor-pointer"
                  onClick={() => onSeek(point.timestampMs)}
                  title={`${point.label} (${point.scenarioId || 'Snap'})`}
                >
                  <span
                    className={`w-2 h-2 rounded-full border border-white shadow-xs ${markerColor} transition-transform group-hover:scale-150`}
                  />
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-3 text-[10px] whitespace-nowrap bg-[#1C1E21] text-white px-1.5 py-0.5 rounded shadow-sm z-30 pointer-events-none font-mono">
                    {point.scenarioId ? `${point.scenarioId}: ` : ''}
                    {point.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Labels at extremes */}
        <div className="flex justify-between text-[10px] text-[#787164] font-mono mt-0.5 px-0.5">
          <span>T - 24 horas</span>
          <span>T - 12h</span>
          <span>T - 2h</span>
          <span className="font-semibold text-[#4D7C0F]">Ahora (LIVE)</span>
        </div>
      </div>

      {/* --- BOTTOM ROW: Playback Controls, Speed & Scenario Jump Pills --- */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#F0EDE7]">
        {/* Play/Pause & Speeds */}
        <div className="flex items-center gap-3">
          {/* Play/Pause Button */}
          <button
            onClick={onTogglePlay}
            data-testid="play-pause-btn"
            aria-label={isPlaying ? 'Pausar reproducción' : 'Iniciar reproducción histórica'}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#FFFFFF] hover:bg-[#FBF8EF] border border-[#D4AF37] text-[#8C6D1F] hover:text-[#B8860B] shadow-xs transition-colors cursor-pointer"
            title={isPlaying ? 'Pausar reproducción' : 'Iniciar reproducción'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
            )}
          </button>

          {/* Speed Selector */}
          <div
            role="group"
            aria-label="Selector de velocidad de reproducción"
            className="flex items-center rounded-lg border border-[#E8E4DC] bg-[#F7F7F5] p-0.5"
          >
            {REPLAY_SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => onSetSpeed(s)}
                data-testid={`speed-btn-${s}x`}
                className={`px-2 py-0.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                  speed === s
                    ? 'bg-[#FFFFFF] text-[#8C6D1F] font-bold shadow-xs border border-[#D4AF37]/40'
                    : 'text-[#787164] hover:text-[#1C1E21]'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Quick Scenario Bookmark Pills */}
        <div className="hidden md:flex items-center gap-1.5">
          <span className="text-[11px] text-[#787164] font-medium mr-1">Escenarios:</span>
          {milestonePoints.map(({ scenarioId, point }) => (
            <button
              key={scenarioId}
              onClick={() => onSeek(point.timestampMs)}
              data-testid={`scenario-pill-${scenarioId}`}
              className="text-[11px] px-2 py-0.5 rounded-md border border-[#E8E4DC] bg-[#FFFFFF] hover:bg-[#FBF8EF] hover:border-[#D4AF37] text-[#4B4639] hover:text-[#8C6D1F] font-mono transition-colors cursor-pointer"
            >
              {scenarioId}
            </button>
          ))}
        </div>

        {/* Active Snapshot Metrics Preview */}
        {activeSnapshot && (
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#787164]">
            <span>
              Procesadas:{' '}
              <strong className="text-[#1C1E21]">
                {activeSnapshot.recordsProcessed.toLocaleString()}
              </strong>
            </span>
            <span className="text-[#E8E4DC]">|</span>
            <span>
              Cuarentena:{' '}
              <strong
                className={
                  activeSnapshot.recordsQuarantined > 0 ? 'text-[#C86A43]' : 'text-[#4D7C0F]'
                }
              >
                {activeSnapshot.recordsQuarantined}
              </strong>
            </span>
          </div>
        )}
      </div>
    </section>
  );
});

TimeTravelScrubber.displayName = 'TimeTravelScrubber';
