import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Database, FileSpreadsheet, Globe, Lock } from 'lucide-react';
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
  const isMasked = Boolean(nodeData.securityMask?.enabled);

  return (
    <div
      role="region"
      aria-label={`${nodeData.label} - Estado: ${statusConfig.label}`}
      className={`relative w-64 rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-3 shadow-[0_2px_8px_rgba(30,20,5,0.04)] transition-all duration-200 ${
        selected ? 'ring-2 ring-[#D4AF37] ring-offset-2 ring-offset-[#FFFFFF]' : 'hover:border-[#D4AF37]'
      } ${isMasked ? 'opacity-30 grayscale-[0.2]' : ''}`}
    >
      {isMasked && (
        <div
          data-testid="source-node-mask-lock"
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[#D4AF37] bg-[#FBF8EF] text-[#8C6D1F] shadow-sm"
          title="Acceso restringido por política Zero-Trust"
        >
          <Lock className="h-3.5 w-3.5" aria-label="Acceso restringido" />
        </div>
      )}

      {/* Cabecera del Nodo */}
      <div className="flex items-center justify-between pb-2 border-b border-[#F0EDE7]">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F7F7F5] border border-[#F0EDE7] text-[#787164]">
            <IconComponent className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[#1C1E21]">{nodeData.label}</h3>
            <span className="text-[10px] text-[#787164] font-mono">{tagLabel}</span>
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

      {/* Métricas Principales */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 text-[10px] font-mono">
        <div className="rounded bg-[#FAFAFA] border border-[#F0EDE7] p-2">
          <span className="block text-[9px] uppercase tracking-tight text-[#8A8374]">Filas Emitidas</span>
          <span className="text-xs font-semibold text-[#1E293B]">
            {nodeData.recordsOut !== undefined ? nodeData.recordsOut.toLocaleString() : 'N/D'}
          </span>
        </div>
        <div className="rounded bg-[#FAFAFA] border border-[#F0EDE7] p-2">
          <span className="block text-[9px] uppercase tracking-tight text-[#8A8374]">Latencia</span>
          <span className="text-xs font-semibold text-[#1E293B]">
            {nodeData.latencyMs !== undefined ? `${nodeData.latencyMs} ms` : 'N/D'}
          </span>
        </div>
      </div>

      {isMasked && (
        <div className="mt-2 rounded-md border border-[#D4AF37]/50 bg-[#FBF8EF] px-2 py-1 text-[9px] uppercase tracking-[0.12em] font-mono font-medium text-[#8C6D1F]">
          Datos protegidos por política
        </div>
      )}

      {/* Puerto de Salida (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!h-2.5 !w-2.5 !rounded-full !border !border-[#FFFFFF] !bg-[#D4AF37] transition-transform hover:!scale-125"
      />
    </div>
  );
});

SourceNode.displayName = 'SourceNode';
