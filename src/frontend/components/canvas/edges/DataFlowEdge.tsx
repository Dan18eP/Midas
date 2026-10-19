import React, { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
} from '@xyflow/react';

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

  const edgeData = data as { label?: string; volume?: number; status?: string } | undefined;
  const isQuarantine = edgeData?.status === 'DEGRADED';
  const strokeColor = isQuarantine ? '#F59E0B' : (style.stroke as string) || '#10B981';

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

      {/* Partículas / Pulso animado ilustrativo en SVG si animated es true */}
      {animated && (
        <circle r="3" fill={strokeColor} className="animate-pulse">
          <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} />
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
            className={`nodrag nopan flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-mono font-semibold shadow-md backdrop-blur-md transition-all ${
              isQuarantine
                ? 'bg-amber-950/90 text-amber-300 border border-amber-600/50'
                : 'bg-slate-950/90 text-slate-300 border border-slate-700/60'
            }`}
          >
            <span>{edgeData.label}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

DataFlowEdge.displayName = 'DataFlowEdge';
