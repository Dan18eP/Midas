import React, { memo, useState } from 'react';
import { X, HardDrive, Clock, Activity, Shield, AlertCircle, FileCode, CheckCircle, Play } from 'lucide-react';
import { MidasNodeData, NODE_STATUS_REGISTRY } from '@/types/canvas';
import { triggerPipeline } from '@/services/sessionService';

interface NodeInspectionDrawerProps {
  selectedNode: MidasNodeData | null;
  onClose: () => void;
}

export const NodeInspectionDrawer = memo(({ selectedNode, onClose }: NodeInspectionDrawerProps) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<string | null>(null);

  if (!selectedNode) {
    return null;
  }

  const handleExecute = async () => {
    if (!selectedNode) return;
    setIsExecuting(true);
    setExecutionResult(null);
    try {
      const rawId = selectedNode.id;
      let connId =
        (selectedNode.details as Record<string, any> | undefined)?.connectionId ||
        selectedNode.connectionId;
      if (!connId) {
        if (rawId.startsWith('conn_')) {
          connId = rawId;
        } else if (rawId.includes('excel') || selectedNode.subType === 'excel') {
          connId = 'conn_excel_budget_default';
        } else if (rawId.includes('postgres') || selectedNode.subType === 'postgresql') {
          connId = 'conn_pg_crm_default';
        } else if (rawId.includes('rest') || rawId.includes('api') || selectedNode.subType === 'api') {
          connId = 'conn_rest_crm_default';
        } else {
          connId = rawId.startsWith('source_') ? rawId.replace('source_', '') : rawId;
        }
      }
      const res = await triggerPipeline(connId);
      setExecutionResult(`Procesado (${res.status}): ${res.records_cleaned} limpios, ${res.records_quarantined} en cuarentena.`);
    } catch (err) {
      setExecutionResult(`Error: ${err instanceof Error ? err.message : 'Fallo en pipeline'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const statusConfig = NODE_STATUS_REGISTRY[selectedNode.status] || NODE_STATUS_REGISTRY.UNKNOWN;

  return (
    <aside
      aria-label="Panel de Inspección de Nodo"
      className="fixed inset-y-0 right-0 z-40 w-96 border-l border-[#E8E4DC] bg-[#FAFAFA] p-5 shadow-2xl backdrop-blur-xl flex flex-col transition-all duration-300 animate-in slide-in-from-right text-[#1C1E21]"
    >
      {/* Cabecera del Drawer */}
      <div className="flex items-center justify-between pb-4 border-b border-[#E8E4DC]">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#B8860B] font-medium">
            {selectedNode.nodeType.toUpperCase()} · {selectedNode.subType.toUpperCase()}
          </span>
          <h2 className="text-base font-bold text-[#1C1E21]">{selectedNode.label}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar panel de inspección"
          className="rounded-lg p-1.5 text-[#4B4639] hover:bg-[#F7F7F5] hover:text-[#1C1E21] focus-visible:ring-1 focus-visible:ring-[#B8860B] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Contenido Scrolleable */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {/* Accion de Ejecucion de Pipeline para Nodos Fuente */}
        {selectedNode.nodeType === 'source' && (
          <div className="rounded-xl border border-[#D4AF37]/50 bg-[#FBF8EF] p-3.5 shadow-sm space-y-2">
            <span className="text-xs font-semibold text-[#8C6D1F] flex items-center gap-1.5">
              <Play className="h-3.5 w-3.5 text-[#B8860B]" />
              Orquestación del Flujo
            </span>
            <button
              type="button"
              onClick={handleExecute}
              disabled={isExecuting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#B8860B] hover:bg-[#8C6D1F] text-white py-2 px-3 text-xs font-medium transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isExecuting ? 'Procesando en Lakehouse...' : 'Ejecutar Pipeline Lakehouse'}
            </button>
            {executionResult && (
              <p className="text-[11px] font-mono text-[#4B4639] bg-white p-2 rounded border border-[#E8E4DC]">
                {executionResult}
              </p>
            )}
          </div>
        )}

        {/* Estado Operacional */}
        <div className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#1C1E21]">Estado Operacional:</span>
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusConfig.bgClass} ${statusConfig.textClass} border ${statusConfig.borderClass}`}
            >
              <span className={`h-2 w-2 rounded-full ${statusConfig.dotClass}`} />
              <span>{statusConfig.label}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-[#4B4639] leading-relaxed">
            {statusConfig.accessibleDescription}
          </p>
        </div>

        {/* Descripción Funcional */}
        <div className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-3.5 shadow-sm">
          <span className="text-xs font-semibold text-[#1C1E21]">Propósito en la Arquitectura:</span>
          <p className="mt-1 text-xs text-[#4B4639] leading-relaxed">{selectedNode.description}</p>
        </div>

        {/* Métricas de Rendimiento */}
        <div className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-3.5 shadow-sm">
          <span className="text-xs font-semibold text-[#1C1E21] flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-[#B8860B]" />
            Métricas de Flujo en Vivo
          </span>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-[#F7F7F5] border border-[#F0EDE7] p-2 shadow-inner">
              <span className="text-[10px] text-[#4B4639] uppercase tracking-wider block">Filas Recibidas</span>
              <span className="text-sm font-mono font-bold text-[#1C1E21]">
                {selectedNode.recordsIn !== undefined ? selectedNode.recordsIn.toLocaleString() : 'N/D'}
              </span>
            </div>
            <div className="rounded-lg bg-[#F7F7F5] border border-[#F0EDE7] p-2 shadow-inner">
              <span className="text-[10px] text-[#4B4639] uppercase tracking-wider block">Filas Procesadas</span>
              <span className="text-sm font-mono font-bold text-[#4D7C0F]">
                {selectedNode.recordsOut !== undefined ? selectedNode.recordsOut.toLocaleString() : 'N/D'}
              </span>
            </div>
            <div className="rounded-lg bg-[#F7F7F5] border border-[#F0EDE7] p-2 shadow-inner">
              <span className="text-[10px] text-[#4B4639] uppercase tracking-wider block">Latencia</span>
              <span className="text-sm font-mono font-bold text-[#1C1E21]">
                {selectedNode.latencyMs !== undefined ? `${selectedNode.latencyMs} ms` : 'N/D'}
              </span>
            </div>
            <div className="rounded-lg bg-[#F7F7F5] border border-[#F0EDE7] p-2 shadow-inner">
              <span className="text-[10px] text-[#4B4639] uppercase tracking-wider block">En Cuarentena</span>
              <span className={`text-sm font-mono font-bold ${selectedNode.quarantinedRecords ? 'text-[#A8422B]' : 'text-[#4B4639]'}`}>
                {selectedNode.quarantinedRecords !== undefined ? selectedNode.quarantinedRecords : 0}
              </span>
            </div>
          </div>
        </div>

        {/* Localización y Contrato de Almacenamiento */}
        {(selectedNode.storagePath || selectedNode.catalogTable) && (
          <div className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-3.5 shadow-sm">
            <span className="text-xs font-semibold text-[#1C1E21] flex items-center gap-1.5">
              <HardDrive className="h-4 w-4 text-[#4B4639]" />
              Contrato de Almacenamiento
            </span>
            <div className="mt-2 space-y-1.5 font-mono text-[11px]">
              {selectedNode.catalogTable && (
                <div className="rounded bg-[#F7F7F5] border border-[#F0EDE7] p-2 text-[#1C1E21]">
                  <span className="text-[#4B4639]">Tabla Catálogo: </span>
                  <span className="text-[#4D7C0F] font-semibold">{selectedNode.catalogTable}</span>
                </div>
              )}
              {selectedNode.storagePath && (
                <div className="rounded bg-[#F7F7F5] border border-[#F0EDE7] p-2 text-[#1C1E21] break-all">
                  <span className="text-[#4B4639]">S3 Path: </span>
                  <span className="text-[#8C4022] font-semibold">{selectedNode.storagePath}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sección Especial: Midas Guardian */}
        {selectedNode.guardianDetails && (
          <div className="rounded-xl border border-[#E8E4DC] bg-[#FBF8EF] p-3.5 shadow-sm">
            <span className="text-xs font-semibold text-[#B8860B] flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-[#B8860B]" />
              Diagnóstico Midas Guardian
            </span>
            <div className="mt-2.5 space-y-2 text-xs">
              <div className="flex justify-between border-b border-[#F0EDE7] pb-1">
                <span className="text-[#4B4639]">Playbook:</span>
                <span className="font-mono font-bold text-[#B8860B]">
                  {selectedNode.guardianDetails.playbook_id || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#F0EDE7] pb-1">
                <span className="text-[#4B4639]">Tipo Anomalía:</span>
                <span className="font-mono text-[#A8422B] font-semibold">
                  {selectedNode.guardianDetails.anomaly_type || 'Ninguna'}
                </span>
              </div>
              <div>
                <span className="text-[#4B4639] block text-[10px] uppercase">Acción de Auto-Sanación:</span>
                <p className="mt-1 text-[#1C1E21] text-[11px] bg-[#FFFFFF] border border-[#E8E4DC] p-2 rounded-lg">
                  {selectedNode.guardianDetails.action_taken || 'En espera'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Metadatos Adicionales / Contratos */}
        {selectedNode.details && Object.keys(selectedNode.details).length > 0 && (
          <div className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-3.5 shadow-sm">
            <span className="text-xs font-semibold text-[#1C1E21] flex items-center gap-1.5">
              <FileCode className="h-4 w-4 text-[#4B4639]" />
              Parámetros de Configuración
            </span>
            <div className="mt-2 space-y-1 font-mono text-[11px]">
              {Object.entries(selectedNode.details).map(([key, val]) => (
                <div key={key} className="flex justify-between rounded bg-[#F7F7F5] border border-[#F0EDE7] px-2.5 py-1">
                  <span className="text-[#4B4639]">{key}:</span>
                  <span className="text-[#1C1E21] font-semibold truncate max-w-[180px]">
                    {Array.isArray(val) ? val.join(', ') : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp de Última Actualización */}
        <div className="flex items-center gap-1.5 text-[10px] text-[#4B4639] font-mono">
          <Clock className="h-3 w-3 text-[#4B4639]" />
          <span>Último evento: {selectedNode.lastUpdated ? new Date(selectedNode.lastUpdated).toLocaleTimeString() : 'N/D'}</span>
        </div>
      </div>
    </aside>
  );
});

NodeInspectionDrawer.displayName = 'NodeInspectionDrawer';
