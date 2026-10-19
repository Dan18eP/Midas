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
      className={`relative w-72 rounded-xl border bg-slate-900/95 p-4 backdrop-blur-md transition-all duration-200 ${
        statusConfig.borderClass
      } ${statusConfig.glowClass} ${
        isHealing ? 'animate-pulse' : ''
      } ${
        selected ? 'ring-2 ring-orange-400 ring-offset-2 ring-offset-slate-950' : 'hover:border-slate-500'
      }`}
    >
      {/* Puerto de Entrada Superior (Desde Silver Quarantine) */}
      <Handle
        type="target"
        position={Position.Top}
        id="quarantine-in"
        className="!h-3 !w-3 !rounded-full !border-2 !border-slate-950 !bg-amber-400 transition-transform hover:!scale-125"
      />

      {/* Cabecera de Midas Guardian */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              isHealing ? 'bg-orange-950 text-orange-400' : 'bg-indigo-950 text-indigo-400'
            }`}
          >
            <IconComponent className={`h-4.5 w-4.5 ${isHealing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100">{nodeData.label}</h3>
            <span className="text-[10px] text-indigo-300 font-mono">WAP Engine · Auto-Healing</span>
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

      {/* Playbook Activo */}
      <div className="mt-2.5 rounded-lg bg-slate-950/70 p-2 border border-slate-800/80">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-400">Playbook en Ejecución:</span>
          <span className="font-mono font-bold text-orange-400">
            {nodeData.guardianDetails?.playbook_id || 'PB-03-QUARANTINE'}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate-300 line-clamp-2">
          {nodeData.guardianDetails?.action_taken || 'Monitoreo activo de anomalías F1 a F5 sin afectación de Gold.'}
        </p>
      </div>

      {/* Métricas de Cuarentena y Desvío */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-slate-300">
        <div className="rounded-lg bg-slate-950/60 p-1.5">
          <span className="block text-[9px] uppercase tracking-wider text-slate-500">Filas Aisladas</span>
          <span className="text-xs font-mono font-bold text-amber-400">
            {nodeData.guardianDetails?.quarantined_records !== undefined
              ? nodeData.guardianDetails.quarantined_records
              : nodeData.quarantinedRecords ?? 0}
          </span>
        </div>
        <div className="rounded-lg bg-slate-950/60 p-1.5">
          <span className="block text-[9px] uppercase tracking-wider text-slate-500">Patrón WAP</span>
          <span className="text-xs font-mono font-bold text-emerald-400">Activo / Seguro</span>
        </div>
      </div>

      {/* Puerto de Salida (Hacia Gold WAP Checkpoint) */}
      <Handle
        type="source"
        position={Position.Right}
        id="wap-out"
        className="!h-3 !w-3 !rounded-full !border-2 !border-slate-950 !bg-indigo-400 transition-transform hover:!scale-125"
      />
    </div>
  );
});

GuardianNode.displayName = 'GuardianNode';
