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
      className="absolute top-4 left-4 z-20 flex items-center gap-2.5 rounded-lg border border-[#E5DCB8] bg-[#FFFFFF] px-3 py-1.5 shadow-xs"
    >
      {/* Indicador de Topología y Salud */}
      <div className="flex items-center gap-2 border-r border-[#E5DCB8] pr-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C0F]" />
        <span className="text-[11px] text-[#787164]">
          Topología Midas:
        </span>
        <span className="font-mono text-[11px] text-[#1C1E21] font-semibold">
          {healthyNodes}/{totalNodes} Activos
        </span>
      </div>

      {/* Botón FitView */}
      <button
        onClick={() => fitView({ padding: 0.2, duration: 600 })}
        className="flex items-center gap-1.5 rounded bg-[#FFFFFF] hover:bg-[#F5F2EA] text-[#4B4639] hover:text-[#1C1E21] border border-[#E5DCB8] px-2 py-0.5 text-[11px] font-medium shadow-xs transition-colors"
        title="Ajustar vista al centro del Canvas (FitView)"
      >
        <Maximize2 className="h-3 w-3 text-[#787164]" aria-hidden="true" />
        <span>Centrar</span>
      </button>

      {/* Botón Reset Layout */}
      {onResetLayout && (
        <button
          onClick={onResetLayout}
          className="flex items-center gap-1.5 rounded bg-[#FFFFFF] hover:bg-[#F5F2EA] text-[#4B4639] hover:text-[#1C1E21] border border-[#E5DCB8] px-2 py-0.5 text-[11px] font-medium shadow-xs transition-colors"
          title="Restablecer posiciones originales de la topología"
        >
          <RotateCcw className="h-3 w-3 text-[#787164]" aria-hidden="true" />
          <span>Restablecer</span>
        </button>
      )}

      {/* Badge de Resiliencia Midas */}
      <div className="flex items-center gap-1.5 rounded bg-[#FBF9F2] text-[#4B4639] border border-[#D4AF37]/50 px-2 py-0.5 text-[11px] shadow-xs">
        <ShieldCheck className="h-3 w-3 text-[#B8860B]" aria-hidden="true" />
        <span className="font-mono text-[10px] text-[#8C6D1F] font-semibold">WAP Protected</span>
      </div>
    </div>
  );
});

CanvasControls.displayName = 'CanvasControls';
