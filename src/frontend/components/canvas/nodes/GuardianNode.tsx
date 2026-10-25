import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { ShieldCheck, ShieldAlert, Cpu, RefreshCw } from 'lucide-react';
import { MidasNodeData, NODE_STATUS_REGISTRY } from '@/types/canvas';

export type GuardianCanvasNode = Node<MidasNodeData, 'guardian'>;

export const GuardianNode = memo(({ data, selected }: NodeProps<GuardianCanvasNode>) => {
  const nodeData = data;
  const statusConfig = NODE_STATUS_REGISTRY[nodeData.status] || NODE_STATUS_REGISTRY.UNKNOWN;
  const isHealing = nodeData.status === 'AUTO_HEALING';
  const isDegraded = nodeData.status === 'DEGRADED' || nodeData.status === 'ERROR';

  const IconComponent = isDegraded ? ShieldAlert : isHealing ? RefreshCw : ShieldCheck;

  return (
    <div
      role="region"
      aria-label={`${nodeData.label} - Resiliencia Activa - Estado: ${statusConfig.label}`}
      className={`relative w-72 rounded-xl bg-[#FFFFFF] border-2 border-[#ECCFC5] p-3 shadow-[0_3px_10px_rgba(168,66,43,0.06)] transition-all duration-200 ${
        isHealing ? 'animate-pulse' : ''
      } ${
        selected ? 'ring-2 ring-[#D4AF37] ring-offset-2 ring-offset-[#FFFFFF]' : 'hover:border-[#BFA882]'
      }`}
    >
      {/* Puerto de Entrada Superior (Desde Silver Quarantine) */}
      <Handle
        type="target"
        position={Position.Top}
        id="quarantine-in"
        className="!h-2.5 !w-2.5 !rounded-full !border !border-[#FFFFFF] !bg-[#C86A43] transition-transform hover:!scale-125"
      />

      {/* Cabecera de Midas Guardian */}
      <div className="flex items-center justify-between pb-2 border-b border-[#F0EDE7]">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
              isHealing
                ? 'bg-orange-50 border-orange-300 text-orange-700'
                : 'bg-[#FAF2EE] border-[#E2B7A6] text-[#A8422B]'
            }`}
          >
            <IconComponent className={`h-4.5 w-4.5 ${isHealing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[#1C1E21]">{nodeData.label}</h3>
            <span className="text-[10px] text-[#A8422B] font-mono font-medium">WAP Engine · Auto-Healing</span>
          </div>
        </div>

        {/* Badge de Estado Canónico */}
        <div
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-medium ${statusConfig.textClass} ${statusConfig.bgClass} border ${statusConfig.borderClass}`}
          title={statusConfig.accessibleDescription}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotClass}`} />
          <span>{statusConfig.label}</span>
        </div>
      </div>

      {/* Playbook Activo */}
      <div className="mt-2.5 bg-[#FAFAFA] p-2 rounded border border-[#F0EDE7] space-y-1">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-[#787164]">Playbook:</span>
          <span className="font-mono text-[#A8422B] font-semibold px-1 rounded bg-[#FDF1ED] border border-[#ECCFC5]">
            {nodeData.guardianDetails?.playbook_id || 'PB-03-QUARANTINE'}
          </span>
        </div>
        <p className="text-[10px] text-[#787164] leading-snug line-clamp-2">
          {nodeData.guardianDetails?.action_taken || 'Standby · Monitoreando F1 a F5'}
        </p>
      </div>

      {/* Métricas de Cuarentena y Desvío */}
      <div className="mt-2.5 pt-2 border-t border-[#F0EDE7] grid grid-cols-2 gap-2 text-[10px] font-mono">
        <div className="rounded bg-[#FAFAFA] border border-[#F0EDE7] p-2">
          <span className="block text-[9px] uppercase tracking-tight text-[#8A8374]">Filas Aisladas</span>
          <span className="text-xs font-bold text-[#A8422B]">
            {nodeData.guardianDetails?.quarantined_records !== undefined
              ? nodeData.guardianDetails.quarantined_records
              : nodeData.quarantinedRecords ?? 0}
          </span>
        </div>
        <div className="rounded bg-[#FAFAFA] border border-[#F0EDE7] p-2">
          <span className="block text-[9px] uppercase tracking-tight text-[#8A8374]">Patrón WAP</span>
          <span className="text-xs font-bold text-[#4D7C0F]">Activo / Seguro</span>
        </div>
      </div>

      {/* Puerto de Salida (Hacia Gold WAP Checkpoint) */}
      <Handle
        type="source"
        position={Position.Right}
        id="wap-out"
        className="!h-2.5 !w-2.5 !rounded-full !border !border-[#FFFFFF] !bg-[#D4AF37] transition-transform hover:!scale-125"
      />
    </div>
  );
});

GuardianNode.displayName = 'GuardianNode';
