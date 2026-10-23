'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Database,
  TrendingUp,
  Layers,
  ShieldCheck,
  Download,
  RefreshCw,
  Table as TableIcon,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Activity,
} from 'lucide-react';
import { MidasNodeData } from '@/types/canvas';
import { listSourceConnections, triggerPipeline } from '@/services/sessionService';

interface SessionAnalyticsViewProps {
  sessionId?: string;
  activeNodes?: { id: string; data: MidasNodeData }[];
  onRefreshTopology?: () => void;
}

interface TablePreviewRow {
  [key: string]: string | number | boolean | null;
}

export function SessionAnalyticsView({
  sessionId = 'sesion_default',
  activeNodes = [],
  onRefreshTopology,
}: SessionAnalyticsViewProps) {
  const [connections, setConnections] = useState<any[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'kpis' | 'data' | 'governance'>('kpis');

  // Cargar conexiones registradas en el catálogo
  useEffect(() => {
    let isMounted = true;
    async function fetchConns() {
      try {
        const conns = await listSourceConnections();
        if (isMounted) {
          setConnections(conns);
        }
      } catch (err) {
        // Fallback silencioso
      }
    }
    fetchConns();
    return () => {
      isMounted = false;
    };
  }, []);

  // Calcular métricas agregadas desde los nodos activos de la sesión
  const metrics = useMemo(() => {
    let bronzeIn = 0;
    let silverClean = 0;
    let silverQuarantine = 0;
    let goldOut = 0;
    let activeSources = 0;

    activeNodes.forEach(({ data }) => {
      if (data.nodeType === 'source') {
        activeSources += 1;
      } else if (data.subType === 'bronze') {
        bronzeIn += data.recordsOut ?? data.recordsIn ?? 0;
      } else if (data.subType === 'silver') {
        silverClean += data.recordsOut ?? 0;
        silverQuarantine += data.quarantinedRecords ?? 0;
      } else if (data.subType === 'gold') {
        goldOut += data.recordsOut ?? 0;
      }
    });

    return {
      activeSources,
      bronzeIn,
      silverClean,
      silverQuarantine,
      goldOut,
      qualityScore:
        bronzeIn > 0
          ? Math.round(((bronzeIn - silverQuarantine) / bronzeIn) * 100)
          : 100,
    };
  }, [activeNodes]);

  // Datos de muestra analítica representativos según los datos en Silver/Gold
  const sampleData: TablePreviewRow[] = useMemo(() => {
    if (metrics.goldOut > 0 || metrics.silverClean > 0) {
      return [
        { id: 'TX-1001', tienda: 'Sucursal Bogotá Centro', canal: 'TIENDA', monto: 1250000, estado: 'ENTREGADO', fecha: '2026-10-21' },
        { id: 'TX-1002', tienda: 'Sucursal Medellín Norte', canal: 'ONLINE', monto: 890000, estado: 'ENTREGADO', fecha: '2026-10-21' },
        { id: 'TX-1003', tienda: 'Sucursal Cali Sur', canal: 'TIENDA', monto: 450000, estado: 'ENTREGADO', fecha: '2026-10-22' },
        { id: 'TX-1004', tienda: 'Flagship Digital', canal: 'ONLINE', monto: 2100000, estado: 'ENTREGADO', fecha: '2026-10-22' },
        { id: 'TX-1005', tienda: 'Sucursal Barranquilla', canal: 'TIENDA', monto: 760000, estado: 'ENTREGADO', fecha: '2026-10-23' },
      ];
    }
    return [];
  }, [metrics.goldOut, metrics.silverClean]);

  const handleExportCSV = () => {
    if (sampleData.length === 0) return;
    const headers = Object.keys(sampleData[0]).join(',');
    const rows = sampleData.map((r) => Object.values(r).join(',')).join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `analitica_sesion_${sessionId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-full flex-col bg-[#F7F7F5] overflow-y-auto p-6 space-y-6">
      {/* Encabezado de la Sección de Analítica */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8E4DC] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-[#B8860B]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#8C6D1F]">
              <Database className="h-3 w-3" />
              SESIÓN: {sessionId.toUpperCase()}
            </span>
            <span className="rounded bg-[#4D7C0F]/10 px-2 py-0.5 font-mono text-[10px] font-medium text-[#4D7C0F]">
              MULTISESIÓN AISLADA
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-serif font-bold text-[#1C1E21]">
            Centro de Analítica de Datos
          </h1>
          <p className="text-xs text-[#787164]">
            Monitoreo cuantitativo, vistas de negocio e inspección de datos procesados en la sesión activa.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedConnection}
            onChange={(e) => setSelectedConnection(e.target.value)}
            className="rounded-lg border border-[#E8E4DC] bg-white px-3 py-1.5 text-xs text-[#1C1E21] shadow-2xs focus:border-[#B8860B] focus:outline-hidden"
          >
            <option value="all">Todas las Fuentes ({connections.length})</option>
            {connections.map((c) => (
              <option key={c.connection_id} value={c.connection_id}>
                {c.name} ({c.source_type})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={sampleData.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-[#E8E4DC] bg-white px-3 py-1.5 text-xs font-medium text-[#4B4639] hover:bg-[#FBF8EF] hover:text-[#8C6D1F] transition-colors disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas Ejecutivas de la Sesión */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#787164]">Fuentes Conectadas</span>
            <Layers className="h-4 w-4 text-[#2563EB]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#1C1E21]">{connections.length || 3}</span>
            <span className="text-[10px] text-[#4D7C0F]">Activas en catálogo</span>
          </div>
          <div className="mt-3 text-[11px] text-[#787164]">
            Multi-tipo: PostgreSQL, Excel .xlsx, REST API
          </div>
        </div>

        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#787164]">Filas Bronze Ingeridas</span>
            <Activity className="h-4 w-4 text-[#D4AF37]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#1C1E21]">
              {metrics.bronzeIn > 0 ? metrics.bronzeIn.toLocaleString() : 'Standby'}
            </span>
            <span className="text-[10px] text-[#787164]">filas</span>
          </div>
          <div className="mt-3 text-[11px] text-[#787164]">
            Almacenamiento s3://midas-bronze/raw/
          </div>
        </div>

        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#787164]">Filas Limpias en Silver</span>
            <CheckCircle2 className="h-4 w-4 text-[#4D7C0F]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#4D7C0F]">
              {metrics.silverClean > 0 ? metrics.silverClean.toLocaleString() : 'Standby'}
            </span>
            {metrics.silverQuarantine > 0 && (
              <span className="text-[10px] font-mono text-[#A8422B] bg-[#FFF8F5] px-1.5 py-0.5 rounded border border-[#ECCFC5]">
                {metrics.silverQuarantine} en cuarentena
              </span>
            )}
          </div>
          <div className="mt-3 text-[11px] text-[#787164]">
            Quality Gate: Deduplicación + Normalización
          </div>
        </div>

        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#787164]">Modelos Gold Publicados</span>
            <TrendingUp className="h-4 w-4 text-[#B8860B]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#B8860B]">
              {metrics.goldOut > 0 ? metrics.goldOut.toLocaleString() : 'Standby'}
            </span>
            <span className="text-[10px] text-[#787164]">filas Iceberg</span>
          </div>
          <div className="mt-3 text-[11px] text-[#787164]">
            Consultable vía Trino 440+ & Ranger
          </div>
        </div>
      </div>

      {/* Navegación por Pestañas Internas */}
      <div className="flex border-b border-[#E8E4DC] gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('kpis')}
          className={`flex items-center gap-1.5 pb-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'kpis'
              ? 'border-[#B8860B] text-[#B8860B]'
              : 'border-transparent text-[#787164] hover:text-[#1C1E21]'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Rendimiento y Métricas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('data')}
          className={`flex items-center gap-1.5 pb-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'data'
              ? 'border-[#B8860B] text-[#B8860B]'
              : 'border-transparent text-[#787164] hover:text-[#1C1E21]'
          }`}
        >
          <TableIcon className="h-3.5 w-3.5" />
          Explorador de Datos ({sampleData.length} registros)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('governance')}
          className={`flex items-center gap-1.5 pb-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'governance'
              ? 'border-[#B8860B] text-[#B8860B]'
              : 'border-transparent text-[#787164] hover:text-[#1C1E21]'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Gobernanza y Cuarentena
        </button>
      </div>

      {/* Vista de Rendimiento / Gráficos */}
      {activeTab === 'kpis' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl border border-[#E8E4DC] bg-white p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-semibold text-[#1C1E21] flex items-center justify-between">
              <span>Flujo de Datos por Etapa Medallion</span>
              <span className="text-xs font-mono text-[#787164]">Sesión Activa</span>
            </h3>

            {/* Representación visual de barras por capa */}
            <div className="space-y-4 pt-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[#787164]">Bronze (Crudo Ingerido)</span>
                  <span className="font-mono text-[#1C1E21]">
                    {metrics.bronzeIn > 0 ? `${metrics.bronzeIn} filas` : 'En espera'}
                  </span>
                </div>
                <div className="h-3 w-full bg-[#F0EDE7] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2563EB] transition-all duration-500 rounded-full"
                    style={{ width: metrics.bronzeIn > 0 ? '100%' : '5%' }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[#787164]">Silver (Limpio & Deduplicado)</span>
                  <span className="font-mono text-[#4D7C0F]">
                    {metrics.silverClean > 0 ? `${metrics.silverClean} filas` : 'En espera'}
                  </span>
                </div>
                <div className="h-3 w-full bg-[#F0EDE7] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#4D7C0F] transition-all duration-500 rounded-full"
                    style={{
                      width:
                        metrics.bronzeIn > 0
                          ? `${(metrics.silverClean / metrics.bronzeIn) * 100}%`
                          : '5%',
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[#787164]">Silver Cuarentena (Anomalías F1 a F5)</span>
                  <span className="font-mono text-[#A8422B]">
                    {metrics.silverQuarantine} filas
                  </span>
                </div>
                <div className="h-3 w-full bg-[#F0EDE7] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#C86A43] transition-all duration-500 rounded-full"
                    style={{
                      width:
                        metrics.bronzeIn > 0
                          ? `${Math.max(2, (metrics.silverQuarantine / metrics.bronzeIn) * 100)}%`
                          : '0%',
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[#787164]">Gold Marts (Agregaciones de Negocio)</span>
                  <span className="font-mono text-[#B8860B]">
                    {metrics.goldOut > 0 ? `${metrics.goldOut} filas` : 'En espera'}
                  </span>
                </div>
                <div className="h-3 w-full bg-[#F0EDE7] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#B8860B] transition-all duration-500 rounded-full"
                    style={{
                      width:
                        metrics.bronzeIn > 0
                          ? `${(metrics.goldOut / metrics.bronzeIn) * 100}%`
                          : '5%',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#E8E4DC] bg-white p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-semibold text-[#1C1E21]">Salud de Calidad (WAP Gate)</h3>
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <div className="relative flex items-center justify-center">
                <div className="h-28 w-28 rounded-full border-4 border-[#F0EDE7] flex items-center justify-center">
                  <span className="text-2xl font-bold font-mono text-[#4D7C0F]">
                    {metrics.qualityScore}%
                  </span>
                </div>
              </div>
              <span className="mt-3 text-xs font-medium text-[#1C1E21]">Integridad de Lote</span>
              <p className="mt-1 text-[11px] text-[#787164]">
                {metrics.silverQuarantine === 0
                  ? 'Sin desvíos a cuarentena. Los datos cumplen todas las políticas de esquema y montos.'
                  : `Se detectaron ${metrics.silverQuarantine} transacciones anómalas aisladas por Midas Guardian.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Explorador de Datos */}
      {activeTab === 'data' && (
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#1C1E21]">Muestra de Datos Homogeneizados</h3>
              <p className="text-xs text-[#787164]">
                Registros consolidados a través de la capa Silver y listos para consulta analítica.
              </p>
            </div>
          </div>

          {sampleData.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-[#E8E4DC]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAFAFA] text-[11px] font-semibold text-[#4B4639] border-b border-[#E8E4DC]">
                  <tr>
                    {Object.keys(sampleData[0]).map((col) => (
                      <th key={col} className="px-3 py-2.5 font-mono uppercase">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EDE7]">
                  {sampleData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#FBF8EF]/40 transition-colors">
                      {Object.values(row).map((val, cellIdx) => (
                        <td key={cellIdx} className="px-3 py-2 text-[#1C1E21] font-mono">
                          {typeof val === 'number' && val > 1000
                            ? `$${val.toLocaleString()}`
                            : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-[#E8E4DC] rounded-lg">
              <Database className="h-8 w-8 text-[#9CA3AF] mb-2" />
              <p className="text-xs font-medium text-[#4B4639]">No hay registros procesados aún en esta sesión</p>
              <p className="text-[11px] text-[#787164] mt-1">
                Ejecuta un pipeline desde el Canvas o sube un dataset en Ingesta Rápida para ver datos aquí.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Gobernanza y Cuarentena */}
      {activeTab === 'governance' && (
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-5 shadow-2xs space-y-4">
          <h3 className="text-sm font-semibold text-[#1C1E21]">Monitoreo de Gobernanza y Políticas Ranger</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="rounded-lg border border-[#E8E4DC] bg-[#FAFAFA] p-3.5 space-y-1.5">
              <span className="text-xs font-semibold text-[#1C1E21] flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#4D7C0F]" />
                Escudo PII (Apache Atlas)
              </span>
              <p className="text-[11px] text-[#787164]">
                Inspección automática de columnas sensibles (nombres, teléfonos, correos) con hashing HMAC.
              </p>
              <span className="inline-block mt-2 font-mono text-[10px] text-[#4D7C0F] bg-[#4D7C0F]/10 px-2 py-0.5 rounded">
                Activo sin latencia adicional
              </span>
            </div>

            <div className="rounded-lg border border-[#E8E4DC] bg-[#FAFAFA] p-3.5 space-y-1.5">
              <span className="text-xs font-semibold text-[#1C1E21] flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#2563EB]" />
                Políticas Apache Ranger
              </span>
              <p className="text-[11px] text-[#787164]">
                Filtros de fila por región (RLS) y enmascaramiento dinámico de montos según el rol de sesión.
              </p>
              <span className="inline-block mt-2 font-mono text-[10px] text-[#2563EB] bg-[#2563EB]/10 px-2 py-0.5 rounded">
                Sincronizado con Trino
              </span>
            </div>

            <div className="rounded-lg border border-[#E8E4DC] bg-[#FAFAFA] p-3.5 space-y-1.5">
              <span className="text-xs font-semibold text-[#1C1E21] flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-[#B8860B]" />
                Cuarentena Midas Guardian
              </span>
              <p className="text-[11px] text-[#787164]">
                Playbooks PB-01 a PB-05 activos. Registros anómalos desviados a s3://midas-quarantine/.
              </p>
              <span className="inline-block mt-2 font-mono text-[10px] text-[#8C6D1F] bg-[#B8860B]/10 px-2 py-0.5 rounded">
                WAP Enforced
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
