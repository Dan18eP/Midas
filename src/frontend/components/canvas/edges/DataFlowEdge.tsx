import React, { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
} from '@xyflow/react';

/**
 * Deterministic calculation of SVG animation duration based on records-per-second (RPS).
 * Higher rate decreases duration (faster particles), safely clamped between minDuration and maxDuration.
 *
 * Formula:
 * speedMultiplier = (clamp(rps, 20) / nominalRps) ^ 0.35
 * duration = clamp(nominalDuration / speedMultiplier, minDuration, maxDuration)
 */
export function calculateParticleDuration(
  rps?: number,
  nominalDuration: number = 2.5,
  minDuration: number = 0.6,
  maxDuration: number = 4.5
): string {
  if (typeof rps !== 'number' || isNaN(rps) || rps <= 0) {
    return `${nominalDuration.toFixed(2)}s`;
  }
  const nominalRps = 1000;
  const speedMultiplier = Math.pow(Math.max(rps, 20) / nominalRps, 0.35);
  const calculatedDuration = nominalDuration / speedMultiplier;
  const clampedDuration = Math.min(maxDuration, Math.max(minDuration, calculatedDuration));
  return `${clampedDuration.toFixed(2)}s`;
}

export interface DataFlowEdgeData {
  label?: string;
  volume?: number;
  status?: string;
  recordsPerSecond?: number;
  duration?: string;
  [key: string]: unknown;
}

export const DataFlowEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  animated,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    borderRadius: 16,
  });

  const edgeData = data as DataFlowEdgeData | undefined;
  const isQuarantine = edgeData?.status === 'DEGRADED' || (edgeData?.label && String(edgeData.label).toLowerCase().includes('cuarentena'));
  const isWap = Boolean(edgeData?.isWap) || (edgeData?.label && String(edgeData.label).toLowerCase().includes('wap'));
  const strokeColor = isQuarantine ? '#C86A43' : (style.stroke as string) || '#2563EB';

  const labelClass = isQuarantine
    ? 'bg-[#FFF8F5] text-[#A8422B] border border-[#ECCFC5]'
    : isWap
    ? 'bg-[#FBF8EF] text-[#8C6D1F] border border-[#D4AF37]'
    : 'bg-[#FFFFFF] text-[#1E293B] border border-[#E8E4DC]';

  // Compute modulated particle duration from recordsPerSecond if provided, or use explicit duration
  const particleDuration =
    edgeData?.duration || calculateParticleDuration(edgeData?.recordsPerSecond);

  return (
    <>
      {/* Línea base del Edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
        }}
      />

      {/* Partículas / Pulso animado en SVG modulado según la tasa de registros */}
      {animated && (
        <circle r="3" fill={strokeColor} className="animate-pulse">
          <animateMotion
            dur={particleDuration}
            repeatCount="indefinite"
            path={edgePath}
          />
        </circle>
      )}

      {/* Etiqueta interactiva sobre la arista */}
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={`nodrag nopan flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium shadow-xs transition-all ${labelClass}`}
          >
            <span>{edgeData.label}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

DataFlowEdge.displayName = 'DataFlowEdge';
