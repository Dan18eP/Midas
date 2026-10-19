import React, { memo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Maximize2, RotateCcw, Activity, ShieldCheck } from 'lucide-react';

interface CanvasControlsProps {
  totalNodes: number;
  healthyNodes: number;
  onResetLayout?: () => void;
}

export const CanvasControls = memo(({ totalNodes, healthyNodes, onResetLayout }: CanvasControlsProps) => {
  const { fitView } = useReactFlow();

  return (
    <div
      aria-label="Controles del Canvas"
      className="absolute top-4 left-4 z-20 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2 shadow-xl backdrop-blur-md"
    >
      {/* Indicador de Topología y Salud */}
      <div className="flex items-center gap-2 border-r border-slate-800 pr-3">
        <Activity className="h-4 w-4 text-blue-400" />
        <span className="text-xs font-semibold text-slate-200">
          Topología Midas:
        </span>
        <span className="rounded-full bg-emerald-950/80 border border-emerald-600/40 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-400">
          {healthyNodes}/{totalNodes} Activos
        </span>
      </div>

      {/* Botón FitView */}
      <button
        onClick={() => fitView({ padding: 0.2, duration: 600 })}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        title="Ajustar vista al centro del Canvas (FitView)"
      >
        <Maximize2 className="h-3.5 w-3.5 text-slate-400" />
        <span>Centrar</span>
      </button>

      {/* Botón Reset Layout */}
      {onResetLayout && (
        <button
          onClick={onResetLayout}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          title="Restablecer posiciones originales de la topología"
        >
          <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
          <span>Restablecer</span>
        </button>
      )}

      {/* Badge de Resiliencia Midas */}
      <div className="flex items-center gap-1 rounded-md bg-indigo-950/60 border border-indigo-700/40 px-2 py-0.5 text-[10px] font-mono text-indigo-300">
        <ShieldCheck className="h-3 w-3 text-indigo-400" />
        <span>WAP Protected</span>
      </div>
    </div>
  );
});

CanvasControls.displayName = 'CanvasControls';
