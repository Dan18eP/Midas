import React, { memo } from 'react';
import { X, HardDrive, Clock, Activity, Shield, AlertCircle, FileCode, CheckCircle } from 'lucide-react';
import { MidasNodeData, NODE_STATUS_REGISTRY } from '@/types/canvas';

interface NodeInspectionDrawerProps {
  selectedNode: MidasNodeData | null;
  onClose: () => void;
}

export const NodeInspectionDrawer = memo(({ selectedNode, onClose }: NodeInspectionDrawerProps) => {
  if (!selectedNode) {
    return null;
  }

  const statusConfig = NODE_STATUS_REGISTRY[selectedNode.status] || NODE_STATUS_REGISTRY.UNKNOWN;

  return (
    <aside
      aria-label="Panel de Inspección de Nodo"
      className="fixed inset-y-0 right-0 z-40 w-96 border-l border-slate-800 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-xl flex flex-col transition-all duration-300 animate-in slide-in-from-right"
    >
      {/* Cabecera del Drawer */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400">
            {selectedNode.nodeType.toUpperCase()} · {selectedNode.subType.toUpperCase()}
          </span>
          <h2 className="text-base font-bold text-slate-100">{selectedNode.label}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar panel de inspección"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Contenido Scrolleable */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {/* Estado Operacional */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Estado Operacional:</span>
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusConfig.bgClass} ${statusConfig.textClass} border ${statusConfig.borderClass}`}
            >
              <span className={`h-2 w-2 rounded-full ${statusConfig.dotClass}`} />
              <span>{statusConfig.label}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            {statusConfig.accessibleDescription}
          </p>
        </div>

        {/* Descripción Funcional */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5">
          <span className="text-xs font-semibold text-slate-300">Propósito en la Arquitectura:</span>
          <p className="mt-1 text-xs text-slate-300 leading-relaxed">{selectedNode.description}</p>
        </div>

        {/* Métricas de Rendimiento */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-blue-400" />
            Métricas de Flujo en Vivo
          </span>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-slate-950/80 p-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Filas Recibidas</span>
              <span className="text-sm font-mono font-bold text-slate-200">
                {selectedNode.recordsIn !== undefined ? selectedNode.recordsIn.toLocaleString() : 'N/D'}
              </span>
            </div>
            <div className="rounded-lg bg-slate-950/80 p-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Filas Procesadas</span>
              <span className="text-sm font-mono font-bold text-emerald-400">
                {selectedNode.recordsOut !== undefined ? selectedNode.recordsOut.toLocaleString() : 'N/D'}
              </span>
            </div>
            <div className="rounded-lg bg-slate-950/80 p-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Latencia</span>
              <span className="text-sm font-mono font-bold text-slate-200">
                {selectedNode.latencyMs !== undefined ? `${selectedNode.latencyMs} ms` : 'N/D'}
              </span>
            </div>
            <div className="rounded-lg bg-slate-950/80 p-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">En Cuarentena</span>
              <span className={`text-sm font-mono font-bold ${selectedNode.quarantinedRecords ? 'text-amber-400' : 'text-slate-400'}`}>
                {selectedNode.quarantinedRecords !== undefined ? selectedNode.quarantinedRecords : 0}
              </span>
            </div>
          </div>
        </div>

        {/* Localización y Contrato de Almacenamiento */}
        {(selectedNode.storagePath || selectedNode.catalogTable) && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <HardDrive className="h-4 w-4 text-emerald-400" />
              Contrato de Almacenamiento
            </span>
            <div className="mt-2 space-y-1.5 font-mono text-[11px]">
              {selectedNode.catalogTable && (
                <div className="rounded bg-slate-950/80 p-1.5 text-slate-300">
                  <span className="text-slate-500">Tabla Catálogo: </span>
                  <span className="text-emerald-400">{selectedNode.catalogTable}</span>
                </div>
              )}
              {selectedNode.storagePath && (
                <div className="rounded bg-slate-950/80 p-1.5 text-slate-300 break-all">
                  <span className="text-slate-500">S3 Path: </span>
                  <span className="text-blue-400">{selectedNode.storagePath}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sección Especial: Midas Guardian */}
        {selectedNode.guardianDetails && (
          <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/30 p-3.5">
            <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-indigo-400" />
              Diagnóstico Midas Guardian
            </span>
            <div className="mt-2.5 space-y-2 text-xs">
              <div className="flex justify-between border-b border-indigo-900/40 pb-1">
                <span className="text-slate-400">Playbook:</span>
                <span className="font-mono font-bold text-orange-400">
                  {selectedNode.guardianDetails.playbook_id || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between border-b border-indigo-900/40 pb-1">
                <span className="text-slate-400">Tipo Anomalía:</span>
                <span className="font-mono text-amber-300">
                  {selectedNode.guardianDetails.anomaly_type || 'Ninguna'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Acción de Auto-Sanación:</span>
                <p className="mt-1 text-slate-300 text-[11px] bg-slate-950/60 p-2 rounded">
                  {selectedNode.guardianDetails.action_taken || 'En espera'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Metadatos Adicionales / Contratos */}
        {selectedNode.details && Object.keys(selectedNode.details).length > 0 && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <FileCode className="h-4 w-4 text-purple-400" />
              Parámetros de Configuración
            </span>
            <div className="mt-2 space-y-1 font-mono text-[11px]">
              {Object.entries(selectedNode.details).map(([key, val]) => (
                <div key={key} className="flex justify-between rounded bg-slate-950/60 px-2 py-1">
                  <span className="text-slate-500">{key}:</span>
                  <span className="text-slate-300 font-semibold truncate max-w-[180px]">
                    {Array.isArray(val) ? val.join(', ') : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp de Última Actualización */}
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
          <Clock className="h-3 w-3" />
          <span>Último evento: {selectedNode.lastUpdated ? new Date(selectedNode.lastUpdated).toLocaleTimeString() : 'N/D'}</span>
        </div>
      </div>
    </aside>
  );
});

NodeInspectionDrawer.displayName = 'NodeInspectionDrawer';
