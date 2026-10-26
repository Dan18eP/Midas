'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Play,
} from 'lucide-react';
import { MidasNodeData } from '@/types/canvas';
import { listSourceConnections, triggerPipeline, executeTrinoQuery, getSessionDetail } from '@/services/sessionService';

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
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'kpis' | 'data' | 'governance'>('kpis');

  // Identificar el nodo fuente exclusivo de esta sesión (1 sesión = 1 conexión de datos)
  const sessionSourceNode = useMemo(
    () => activeNodes.find((n) => n.data.nodeType === 'source'),
    [activeNodes]
  );
  const sessionConnId = (sessionSourceNode?.data?.connectionId || (sessionSourceNode?.data?.details?.connectionId as string) || '') as string;
  const sessionSourceName = sessionSourceNode?.data?.label || 'Fuente de Datos';
  const sessionSourceType = sessionSourceNode?.data?.subType || 'csv';

  // Estados para datos vivos de Trino
  const [realData, setRealData] = useState<TablePreviewRow[]>([]);
  const [realColumns, setRealColumns] = useState<string[]>([]);
  const [realTotalCount, setRealTotalCount] = useState<number | null>(null);
  const [isQueryingData, setIsQueryingData] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [activeTableName, setActiveTableName] = useState<string>('');
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');

  // Estados de ejecución en caliente del pipeline
  const [isExecutingPipeline, setIsExecutingPipeline] = useState(false);
  const [pipelineExecutionMessage, setPipelineExecutionMessage] = useState<string | null>(null);

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

  // Consultar datos reales de Trino para la fuente de esta sesión
  const loadTableData = useCallback(async (targetTable?: string) => {
    setIsQueryingData(true);
    setQueryError(null);

    // Determinar tablas candidatas a consultar exclusivamente según la fuente de esta sesión (1 Sesión = 1 Conexión)
    let candidateTables: string[] = [];
    if (sessionConnId) {
      const cleanSuffix = sessionConnId
        .replace(/^conn_/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_');
      candidateTables.push(`silver.clean_${cleanSuffix}`);
    }

    // Descubrir tablas Gold legítimas asociadas a los nodos de la sesión si ya fueron materializadas
    activeNodes.forEach(({ data }) => {
      if (data.catalogTable && typeof data.catalogTable === 'string') {
        const tbl = data.catalogTable.trim();
        if (tbl.startsWith('gold.') && !tbl.includes('personalizado') && !tbl.toLowerCase().includes('por definir')) {
          candidateTables.push(tbl);
        }
      }
    });

    // Descubrir tablas Gold guardadas en los metadatos persistentes de la sesión en PostgreSQL
    if (sessionId && sessionId !== 'sesion_default' && sessionId !== 'default') {
      try {
        const sess = await getSessionDetail(sessionId);
        const meta = sess?.metadata as Record<string, any> | undefined;
        if (meta?.gold_tables && Array.isArray(meta.gold_tables)) {
          meta.gold_tables.forEach((gt: unknown) => {
            if (typeof gt === 'string' && gt.trim().startsWith('gold.')) {
              candidateTables.push(gt.trim());
            }
          });
        }
      } catch {
        // Fallback silencioso
      }
    }

    const uniqueCandidates = Array.from(new Set(candidateTables));
    if (uniqueCandidates.length === 0) {
      setRealData([]);
      setRealColumns([]);
      setRealTotalCount(null);
      setActiveTableName('');
      setIsQueryingData(false);
      return;
    }

    const tablesToTry = targetTable ? [targetTable] : uniqueCandidates;

    let loaded = false;
    const foundTables: string[] = [];

    for (const tbl of tablesToTry) {
      try {
        const result = await executeTrinoQuery(`SELECT * FROM ${tbl} LIMIT 50`);
        const isValidColumns = Boolean(
          result &&
          Array.isArray(result.columns) &&
          result.columns.length > 0 &&
          !result.columns.includes('*')
        );
        if (result && Array.isArray(result.data) && result.data.length > 0 && isValidColumns) {
          if (!loaded) {
            setRealData(result.data as TablePreviewRow[]);
            setRealColumns(result.columns || Object.keys(result.data[0]));
            setActiveTableName(tbl);
            if (!selectedTable) {
              setSelectedTable(tbl);
            }
            loaded = true;

            // Obtener conteo total real
            try {
              const countResult = await executeTrinoQuery(`SELECT COUNT(*) as total_rows FROM ${tbl}`);
              if (countResult?.data?.[0]) {
                const val = countResult.data[0].total_rows ?? countResult.data[0]._col0;
                if (typeof val === 'number') {
                  setRealTotalCount(val);
                }
              }
            } catch {
              setRealTotalCount(result.row_count || result.data.length);
            }
          }
          foundTables.push(tbl);
        }
      } catch {
        // Continuar con siguiente tabla candidata
      }
    }

    if (foundTables.length > 0) {
      setAvailableTables((prev) => {
        const combined = Array.from(new Set([...prev, ...foundTables]));
        if (combined.length === prev.length && combined.every((t, i) => t === prev[i])) {
          return prev;
        }
        return combined;
      });
    }

    if (!loaded) {
      setRealData((prev) => (targetTable && targetTable !== selectedTable ? [] : prev));
      if (!targetTable || targetTable === candidateTables[0]) {
        setActiveTableName(candidateTables[0] || 'silver');
      }
    }
    setIsQueryingData(false);
  }, [sessionConnId, selectedTable]);

  useEffect(() => {
    loadTableData(selectedTable);
  }, [loadTableData, selectedTable]);

  const handleRunPipeline = async () => {
    if (!sessionConnId) return;
    setIsExecutingPipeline(true);
    setPipelineExecutionMessage(null);
    try {
      const result = await triggerPipeline(sessionConnId);
      setPipelineExecutionMessage(`Pipeline ejecutado exitosamente. Se limpiaron ${result.records_cleaned?.toLocaleString()} registros.`);
      onRefreshTopology?.();
      await loadTableData();
    } catch (err: any) {
      setPipelineExecutionMessage(`Error al ejecutar pipeline: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsExecutingPipeline(false);
    }
  };

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
        // Solo considerar filas Gold si fue materializada legítimamente
        if (data.status === 'HEALTHY' && !data.label?.toLowerCase().includes('por definir')) {
          goldOut += data.recordsOut ?? 0;
        }
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

  // Análisis visual dinámico calculado directamente de los registros de la tabla activa
  const visualInsights = useMemo(() => {
    if (!realData || realData.length === 0 || !realColumns || realColumns.length === 0) return null;

    const numCol =
      realColumns.find((c) => {
        const isNum = realData.some((r) => typeof r[c] === 'number');
        return isNum && !/(?:id|_id|index|codigo|anio|mes|dia|fecha|date)/i.test(c);
      }) || realColumns.find((c) => realData.some((r) => typeof r[c] === 'number'));

    const catCol =
      realColumns.find((c) => {
        return (
          c !== numCol &&
          !/(?:id|_id|index|codigo|fecha|date|time)/i.test(c) &&
          realData.some((r) => typeof r[c] === 'string')
        );
      }) || realColumns.find((c) => c !== numCol);

    if (!catCol) return null;

    const groupTotals: Record<string, number> = {};
    const groupCounts: Record<string, number> = {};

    realData.forEach((row) => {
      const catKey = String(row[catCol] ?? 'Sin clasificar');
      groupCounts[catKey] = (groupCounts[catKey] || 0) + 1;
      if (numCol && typeof row[numCol] === 'number') {
        groupTotals[catKey] = (groupTotals[catKey] || 0) + Number(row[numCol]);
      }
    });

    const isCurrency = numCol
      ? /(?:monto|precio|costo|valor|salario|sueldo|ingreso|presupuesto|revenue|fee|neto|bruto)/i.test(numCol)
      : false;

    const items =
      Object.keys(groupTotals).length > 0 && numCol
        ? Object.entries(groupTotals).map(([name, val]) => ({ name, value: Math.round(val * 100) / 100 }))
        : Object.entries(groupCounts).map(([name, count]) => ({ name, value: count }));

    items.sort((a, b) => b.value - a.value);
    const topItems = items.slice(0, 6);
    const maxVal = Math.max(...topItems.map((i) => i.value), 1);

    return {
      catCol,
      numCol: numCol || 'conteo_filas',
      topItems,
      maxVal,
      isCurrency,
    };
  }, [realData, realColumns]);

  const handleExportCSV = () => {
    if (realData.length === 0 || realColumns.length === 0) return;
    const headers = realColumns.join(',');
    const rows = realData
      .map((r) => realColumns.map((col) => JSON.stringify(r[col] ?? '')).join(','))
      .join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `datos_reales_${sessionId}_${activeTableName.replace('.', '_')}.csv`);
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

        <div className="flex flex-wrap items-center gap-3">
          {availableTables.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg border border-[#E8E4DC] bg-white p-1 text-xs font-mono shadow-2xs">
              <span className="px-1 text-[10px] text-[#787164] font-sans font-medium">TABLA:</span>
              {availableTables.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setSelectedTable(t);
                    loadTableData(t);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    activeTableName === t
                      ? t.startsWith('gold.')
                        ? 'bg-[#B8860B] text-white'
                        : 'bg-[#4D7C0F] text-white'
                      : 'text-[#787164] hover:bg-[#F0EDE7]'
                  }`}
                >
                  {t.startsWith('gold.') ? '★ GOLD: ' : 'SILVER: '}
                  {t.replace(/^silver\./, '').replace(/^gold\./, '').replace(/^clean_/, '')}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-lg border border-[#E8E4DC] bg-white px-3 py-1.5 text-xs text-[#1C1E21] shadow-2xs font-mono">
            <Layers className="h-3.5 w-3.5 text-[#B8860B]" />
            <span className="font-semibold text-[#8C6D1F]">FUENTE:</span>
            <span>{sessionSourceName}</span>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={realData.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-[#E8E4DC] bg-white px-3 py-1.5 text-xs font-medium text-[#4B4639] hover:bg-[#FBF8EF] hover:text-[#8C6D1F] transition-colors disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Banner de Ejecución si la fuente aún no ha sido procesada */}
      {realData.length === 0 && (
        <div className="rounded-xl border border-[#D4AF37]/50 bg-[#FFFDF5] p-5 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#8C6D1F]">
            <AlertTriangle className="h-4 w-4" />
            <span>Fuente en Standby: Datos sin Procesar en Silver</span>
          </div>
          <p className="text-xs text-[#787164]">
            La fuente <strong>{sessionSourceName}</strong> está conectada en Bronze. Haz clic en el botón para ejecutar la ingesta y limpieza en el Lakehouse y ver los registros reales aquí.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleRunPipeline}
              disabled={isExecutingPipeline || !sessionConnId}
              className="flex items-center gap-2 rounded-lg bg-[#B8860B] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#8C6D1F] active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isExecutingPipeline ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Ejecutando Pipeline (Bronze → Silver)...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>▶ Ejecutar Pipeline Ahora</span>
                </>
              )}
            </button>
            {pipelineExecutionMessage && (
              <span className="text-xs text-[#4D7C0F] font-medium">{pipelineExecutionMessage}</span>
            )}
          </div>
        </div>
      )}

      {/* Tarjetas de Métricas Ejecutivas de la Sesión */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#787164]">Fuente Conectada</span>
            <Layers className="h-4 w-4 text-[#2563EB]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#1C1E21]">{sessionConnId ? 1 : 0}</span>
            <span className="text-[10px] text-[#4D7C0F]">Sesión Activa</span>
          </div>
          <div className="mt-3 text-[11px] text-[#787164] truncate">
            {sessionSourceName} ({sessionSourceType.toUpperCase()})
          </div>
        </div>

        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#787164]">Filas Bronze Ingeridas</span>
            <Activity className="h-4 w-4 text-[#D4AF37]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#1C1E21]">
              {realTotalCount !== null && realTotalCount > 0
                ? realTotalCount.toLocaleString()
                : metrics.bronzeIn > 0
                ? metrics.bronzeIn.toLocaleString()
                : realData.length > 0
                ? `${realData.length.toLocaleString()}+`
                : 'Standby'}
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
              {realTotalCount !== null && realTotalCount > 0
                ? realTotalCount.toLocaleString()
                : metrics.silverClean > 0
                ? metrics.silverClean.toLocaleString()
                : realData.length > 0
                ? `${realData.length.toLocaleString()}+`
                : 'Standby'}
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
          Explorador de Datos ({realData.length} registros)
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
                    {realTotalCount !== null ? `${realTotalCount.toLocaleString()} filas` : (metrics.bronzeIn > 0 ? `${metrics.bronzeIn.toLocaleString()} filas` : 'En espera')}
                  </span>
                </div>
                <div className="h-3 w-full bg-[#F0EDE7] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2563EB] transition-all duration-500 rounded-full"
                    style={{ width: (realTotalCount ?? metrics.bronzeIn) > 0 ? '100%' : '5%' }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[#787164]">Silver (Limpio & Deduplicado)</span>
                  <span className="font-mono text-[#4D7C0F]">
                    {realTotalCount !== null ? `${realTotalCount.toLocaleString()} filas` : (metrics.silverClean > 0 ? `${metrics.silverClean.toLocaleString()} filas` : 'En espera')}
                  </span>
                </div>
                <div className="h-3 w-full bg-[#F0EDE7] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#4D7C0F] transition-all duration-500 rounded-full"
                    style={{
                      width: (realTotalCount ?? metrics.bronzeIn) > 0 ? '100%' : '5%',
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
                    {metrics.goldOut > 0 ? `${metrics.goldOut.toLocaleString()} filas` : 'En espera (Por definir)'}
                  </span>
                </div>
                <div className="h-3 w-full bg-[#F0EDE7] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#B8860B] transition-all duration-500 rounded-full"
                    style={{
                      width:
                        metrics.bronzeIn > 0 && metrics.goldOut > 0
                          ? `${(metrics.goldOut / metrics.bronzeIn) * 100}%`
                          : '0%',
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

          {/* Tarjeta de Desglose Visual y Reporte Dinámico */}
          {visualInsights && visualInsights.topItems.length > 0 && (
            <div className="lg:col-span-3 rounded-xl border border-[#E8E4DC] bg-white p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F0EDE7] pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#1C1E21] flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[#B8860B]" />
                    <span>
                      Desglose Ejecutivo de Datos: {visualInsights.catCol.toUpperCase()} vs{' '}
                      {visualInsights.numCol.toUpperCase()}
                    </span>
                    {activeTableName.startsWith('gold.') && (
                      <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-[#B8860B]/10 text-[#8C6D1F] border border-[#B8860B]/30 font-semibold">
                        ★ DATA MART GOLD
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-[#787164]">
                    Distribución y agregación dinámica calculada en tiempo real sobre los registros de {activeTableName}.
                  </p>
                </div>
                <span className="font-mono text-[10px] text-[#787164]">
                  Muestra de {realData.length} registros cargados
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {visualInsights.topItems.map((item, idx) => {
                  const pct = Math.round((item.value / visualInsights.maxVal) * 100);
                  const formattedVal = visualInsights.isCurrency
                    ? `$${item.value.toLocaleString()}`
                    : item.value.toLocaleString();
                  return (
                    <div key={idx} className="rounded-lg border border-[#F0EDE7] bg-[#FAFAFA] p-3 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-[#1C1E21] truncate max-w-[180px]" title={item.name}>
                          {idx + 1}. {item.name}
                        </span>
                        <span className="font-mono font-bold text-[#8C6D1F]">
                          {formattedVal}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-[#E8E4DC] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#B8860B] rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(5, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Explorador de Datos */}
      {activeTab === 'data' && (
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#1C1E21] flex items-center gap-2">
                <span>Visor de Datos Reales (Trino Lakehouse)</span>
                {activeTableName && (
                  <span className="font-mono text-[10px] font-normal px-2 py-0.5 rounded bg-[#FBF8EF] border border-[#D4AF37]/50 text-[#8C6D1F]">
                    {activeTableName}
                  </span>
                )}
              </h3>
              <p className="text-xs text-[#787164]">
                Registros reales extraídos y limpiados en la sesión activa sin datos simulados.
              </p>
            </div>
            {isQueryingData && (
              <span className="text-xs font-mono text-[#8C6D1F] flex items-center gap-1.5 animate-pulse">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Consultando Trino...
              </span>
            )}
          </div>

          {realData.length > 0 && realColumns.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-[#E8E4DC]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAFAFA] text-[11px] font-semibold text-[#4B4639] border-b border-[#E8E4DC]">
                  <tr>
                    {realColumns.map((col) => (
                      <th key={col} className="px-3 py-2.5 font-mono uppercase whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EDE7]">
                  {realData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#FBF8EF]/40 transition-colors">
                      {realColumns.map((col, cellIdx) => {
                        const val = row[col];
                        const isCurrency = /(?:monto|precio|costo|valor|salario|sueldo|ingreso|presupuesto|revenue|fee|neto|bruto)/i.test(col);
                        return (
                          <td key={cellIdx} className="px-3 py-2 text-[#1C1E21] font-mono whitespace-nowrap">
                            {typeof val === 'number'
                              ? isCurrency && val > 0
                                ? `$${val.toLocaleString()}`
                                : val.toLocaleString()
                              : String(val ?? '—')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-[#E8E4DC] rounded-lg">
              <Database className="h-8 w-8 text-[#9CA3AF] mb-2" />
              <p className="text-xs font-medium text-[#4B4639]">
                {isQueryingData
                  ? 'Cargando registros desde el catálogo Iceberg / Trino...'
                  : 'No hay registros procesados aún para esta fuente en Silver'}
              </p>
              <p className="text-[11px] text-[#787164] mt-1">
                Ejecuta el pipeline desde el Canvas del Lakehouse para ingerir y limpiar los datos de tu fuente.
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
