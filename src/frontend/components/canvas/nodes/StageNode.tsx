import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Layers, CheckCircle2, Sparkles, AlertTriangle, HardDrive } from 'lucide-react';
import { MidasNodeData, NODE_STATUS_REGISTRY } from '@/types/canvas';

export type StageCanvasNode = Node<MidasNodeData, 'stage'>;

const STAGE_CONFIG = {
  bronze: {
    icon: Layers,
    badgeText: 'Bronze · Append-Only',
    accentColor: 'text-[#8C4022]',
    titleColor: 'text-[#1C1E21]',
    iconBg: 'bg-[#FAF2EE] border border-[#E2B7A6]',
    borderClass: 'border-2 border-[#ECCFC5] shadow-[0_3px_10px_rgba(200,106,67,0.06)]',
    tagBg: 'bg-[#FAFAFA] border border-[#F0EDE7] text-[#4B4639]',
    bulletColor: 'text-[#C86A43]',
    outHandleBg: '!bg-[#C86A43]',
  },
  silver: {
    icon: CheckCircle2,
    badgeText: 'Silver · Quality Gate',
    accentColor: 'text-[#475569]',
    titleColor: 'text-[#1C1E21]',
    iconBg: 'bg-[#F1F5F9] border border-[#CBD5E1]',
    borderClass: 'border-2 border-[#CBD5E1] shadow-[0_3px_10px_rgba(100,116,139,0.06)]',
    tagBg: 'bg-[#FAFAFA] border border-[#F0EDE7] text-[#4B4639]',
    bulletColor: 'text-[#64748B]',
    outHandleBg: '!bg-[#D4AF37]',
  },
  gold: {
    icon: Sparkles,
    badgeText: 'Gold · Certified Marts',
    accentColor: 'text-[#B8860B]',
    titleColor: 'text-[#8C6D1F]',
    iconBg: 'bg-[#FBF8EF] border border-[#D4AF37]',
    borderClass: 'border-2 border-[#D4AF37] shadow-[0_4px_16px_rgba(212,175,55,0.14)]',
    tagBg: 'bg-[#FBF8EF] border border-[#F0EDE7] text-[#8C6D1F]',
    bulletColor: 'text-[#B8860B]',
    outHandleBg: '!bg-[#D4AF37]',
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
      className={`relative w-72 rounded-xl bg-[#FFFFFF] p-3.5 transition-all duration-200 ${
        stageMeta.borderClass
      } ${
        selected ? 'ring-2 ring-[#D4AF37] ring-offset-2 ring-offset-[#FFFFFF]' : 'hover:border-[#D4AF37]'
      }`}
    >
      {/* Puerto de Entrada (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!h-2.5 !w-2.5 !rounded-full !border !border-[#FFFFFF] !bg-[#D4AF37] transition-transform hover:!scale-125"
      />

      {/* Cabecera del Nodo Medallón */}
      <div className="flex items-center justify-between pb-2 border-b border-[#F0EDE7]">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stageMeta.iconBg} ${stageMeta.accentColor}`}>
            <IconComponent className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div>
            <h3 className={`text-xs font-semibold ${stageMeta.titleColor}`}>{nodeData.label}</h3>
            <span className={`text-[10px] font-mono font-medium ${stageMeta.accentColor}`}>{stageMeta.badgeText}</span>
          </div>
        </div>

        {/* Badge de Estado Canónico */}
        <div
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-medium text-[#4D7C0F] bg-[#4D7C0F]/10 border border-[#4D7C0F]/25"
          title={statusConfig.accessibleDescription}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#4D7C0F]" />
          <span>{statusConfig.label}</span>
        </div>
      </div>

      {/* Identificador de Tabla y Path */}
      <div className={`mt-2 flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono ${stageMeta.tagBg} truncate`}>
        <span className={stageMeta.bulletColor}>■</span>
        <span className="truncate font-medium">{nodeData.catalogTable || nodeData.storagePath || 'Iceberg Table'}</span>
      </div>

      {/* Métricas Principales */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 text-[10px] font-mono">
        <div className="rounded bg-[#FAFAFA] border border-[#F0EDE7] p-2">
          <span className="block text-[9px] uppercase tracking-tight text-[#8A8374]">Filas Recibidas</span>
          <span className="text-xs font-semibold text-[#1E293B]">
            {nodeData.recordsIn !== undefined ? nodeData.recordsIn.toLocaleString() : 'N/D'}
          </span>
        </div>
        <div className="rounded bg-[#FAFAFA] border border-[#F0EDE7] p-2">
          <span className="block text-[9px] uppercase tracking-tight text-[#8A8374]">Filas Válidas</span>
          <span className="text-xs font-semibold text-[#4D7C0F]">
            {nodeData.recordsOut !== undefined ? nodeData.recordsOut.toLocaleString() : 'N/D'}
          </span>
        </div>
      </div>

      {/* Alerta de Cuarentena (Silver) */}
      {nodeData.quarantinedRecords !== undefined && nodeData.quarantinedRecords > 0 && (
        <div className="mt-2 flex items-center justify-between rounded bg-[#FFF5F2] border border-[#ECCFC5] px-2 py-1 text-[10px] text-[#A8422B]">
          <div className="flex items-center gap-1 font-mono">
            <AlertTriangle className="h-3 w-3 text-[#A8422B]" />
            <span>Desvío Cuarentena:</span>
          </div>
          <span className="font-mono font-bold text-[#A8422B]">{nodeData.quarantinedRecords} filas</span>
        </div>
      )}

      {/* Puertos de Salida (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className={`!h-2.5 !w-2.5 !rounded-full !border !border-[#FFFFFF] ${stageMeta.outHandleBg} transition-transform hover:!scale-125`}
      />

      {/* Puerto Inferior Especial para bifurcación Silver -> Guardian */}
      {stageType === 'silver' && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="quarantine-out"
          className="!h-2.5 !w-2.5 !rounded-full !border !border-[#FFFFFF] !bg-[#C86A43] transition-transform hover:!scale-125"
        />
      )}
    </div>
  );
});

StageNode.displayName = 'StageNode';
