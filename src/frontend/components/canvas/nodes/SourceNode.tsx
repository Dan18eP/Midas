import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Database, FileSpreadsheet, Globe, Activity } from 'lucide-react';
import { MidasNodeData, NODE_STATUS_REGISTRY } from '@/types/canvas';

export type SourceCanvasNode = Node<MidasNodeData, 'source'>;

const SUBTYPE_ICONS = {
  postgresql: Database,
  excel: FileSpreadsheet,
  api: Globe,
};

const SUBTYPE_TAGS = {
  postgresql: 'PostgreSQL · JDBC',
  excel: 'Excel · S3 Upload',
  api: 'REST · Webhook',
};

export const SourceNode = memo(({ data, selected }: NodeProps<SourceCanvasNode>) => {
  const nodeData = data;
  const statusConfig = NODE_STATUS_REGISTRY[nodeData.status] || NODE_STATUS_REGISTRY.UNKNOWN;
  const IconComponent = (nodeData.subType && SUBTYPE_ICONS[nodeData.subType as keyof typeof SUBTYPE_ICONS]) || Database;
  const tagLabel = (nodeData.subType && SUBTYPE_TAGS[nodeData.subType as keyof typeof SUBTYPE_TAGS]) || 'Fuente de Datos';

  return (
    <div
      role="region"
      aria-label={`${nodeData.label} - Estado: ${statusConfig.label}`}
      className={`relative w-64 rounded-xl border bg-slate-900/90 p-3.5 backdrop-blur-md transition-all duration-200 ${
        statusConfig.borderClass
      } ${statusConfig.glowClass} ${
        selected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-950' : 'hover:border-slate-500'
      }`}
    >
      {/* Cabecera del Nodo */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-blue-400">
            <IconComponent className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-100">{nodeData.label}</h3>
            <span className="text-[10px] text-slate-400">{tagLabel}</span>
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

      {/* Métricas Principales */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 text-slate-300">
        <div className="rounded-lg bg-slate-950/60 p-1.5">
          <span className="block text-[9px] uppercase tracking-wider text-slate-500">Filas Emitidas</span>
          <span className="text-xs font-mono font-bold text-slate-200">
            {nodeData.recordsOut !== undefined ? nodeData.recordsOut.toLocaleString() : 'N/D'}
          </span>
        </div>
        <div className="rounded-lg bg-slate-950/60 p-1.5">
          <span className="block text-[9px] uppercase tracking-wider text-slate-500">Latencia</span>
          <span className="text-xs font-mono font-bold text-slate-200">
            {nodeData.latencyMs !== undefined ? `${nodeData.latencyMs} ms` : 'N/D'}
          </span>
        </div>
      </div>

      {/* Puerto de Salida (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!h-3 !w-3 !rounded-full !border-2 !border-slate-950 !bg-blue-400 transition-transform hover:!scale-125"
      />
    </div>
  );
});

SourceNode.displayName = 'SourceNode';
