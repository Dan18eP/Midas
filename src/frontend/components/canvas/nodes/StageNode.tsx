import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Layers, CheckCircle2, Sparkles, AlertTriangle, HardDrive } from 'lucide-react';
import { MidasNodeData, NODE_STATUS_REGISTRY } from '@/types/canvas';

export type StageCanvasNode = Node<MidasNodeData, 'stage'>;

const STAGE_CONFIG = {
  bronze: {
    icon: Layers,
    badgeText: 'Bronze · Append-Only',
    accentColor: 'text-amber-500',
    iconBg: 'bg-amber-950/50',
    borderHue: 'border-amber-700/50',
  },
  silver: {
    icon: CheckCircle2,
    badgeText: 'Silver · Quality Gate',
    accentColor: 'text-slate-300',
    iconBg: 'bg-slate-800/60',
    borderHue: 'border-slate-500/50',
  },
  gold: {
    icon: Sparkles,
    badgeText: 'Gold · Certified Marts',
    accentColor: 'text-yellow-400',
    iconBg: 'bg-yellow-950/40',
    borderHue: 'border-yellow-600/50',
  },
};

export const StageNode = memo(({ data, selected }: NodeProps<StageCanvasNode>) => {
  const nodeData = data;
  const statusConfig = NODE_STATUS_REGISTRY[nodeData.status] || NODE_STATUS_REGISTRY.UNKNOWN;
  const stageType = (nodeData.subType as 'bronze' | 'silver' | 'gold') || 'silver';
  const stageMeta = STAGE_CONFIG[stageType] || STAGE_CONFIG.silver;
  const IconComponent = stageMeta.icon;

  return (
    <div
      role="region"
      aria-label={`${nodeData.label} - Capa ${stageType.toUpperCase()} - Estado: ${statusConfig.label}`}
      className={`relative w-72 rounded-xl border bg-slate-900/90 p-4 backdrop-blur-md transition-all duration-200 ${
        statusConfig.borderClass
      } ${statusConfig.glowClass} ${
        selected ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-950' : 'hover:border-slate-500'
      }`}
    >
      {/* Puerto de Entrada (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!h-3 !w-3 !rounded-full !border-2 !border-slate-950 !bg-emerald-400 transition-transform hover:!scale-125"
      />

      {/* Cabecera del Nodo Medallón */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stageMeta.iconBg} ${stageMeta.accentColor}`}>
            <IconComponent className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100">{nodeData.label}</h3>
            <span className="text-[10px] text-slate-400">{stageMeta.badgeText}</span>
          </div>
        </div>

        {/* Badge de Estado Canónico */}
        <div
          className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusConfig.bgClass} ${statusConfig.textClass} border ${statusConfig.borderClass}`}
          title={statusConfig.accessibleDescription}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotClass}`} />
          <span>{statusConfig.label}</span>
        </div>
      </div>

      {/* Identificador de Tabla y Path */}
      <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 font-mono truncate">
        <HardDrive className="h-3 w-3 shrink-0 text-slate-500" />
        <span className="truncate">{nodeData.catalogTable || nodeData.storagePath || 'Iceberg Table'}</span>
      </div>

      {/* Métricas Principales */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 text-slate-300">
        <div className="rounded-lg bg-slate-950/60 p-1.5">
          <span className="block text-[9px] uppercase tracking-wider text-slate-500">Filas Recibidas</span>
          <span className="text-xs font-mono font-bold text-slate-200">
            {nodeData.recordsIn !== undefined ? nodeData.recordsIn.toLocaleString() : 'N/D'}
          </span>
        </div>
        <div className="rounded-lg bg-slate-950/60 p-1.5">
          <span className="block text-[9px] uppercase tracking-wider text-slate-500">Filas Válidas</span>
          <span className="text-xs font-mono font-bold text-emerald-400">
            {nodeData.recordsOut !== undefined ? nodeData.recordsOut.toLocaleString() : 'N/D'}
          </span>
        </div>
      </div>

      {/* Alerta de Cuarentena (Silver) */}
      {nodeData.quarantinedRecords !== undefined && nodeData.quarantinedRecords > 0 && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-950/40 border border-amber-600/40 px-2 py-1 text-[10px] text-amber-300">
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            <span>Desvío Cuarentena:</span>
          </div>
          <span className="font-mono font-bold">{nodeData.quarantinedRecords} filas</span>
        </div>
      )}

      {/* Puertos de Salida (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!h-3 !w-3 !rounded-full !border-2 !border-slate-950 !bg-emerald-400 transition-transform hover:!scale-125"
      />

      {/* Puerto Inferior Especial para bifurcación Silver -> Guardian */}
      {stageType === 'silver' && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="quarantine-out"
          className="!h-3 !w-3 !rounded-full !border-2 !border-slate-950 !bg-amber-400 transition-transform hover:!scale-125"
        />
      )}
    </div>
  );
});

StageNode.displayName = 'StageNode';
