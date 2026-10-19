'use client';

import { useMemo, useRef, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart3, Download, Table2 } from 'lucide-react';
import { formatChartValue, hasChartSeriesData, normalizeEChartsOption, optionToTable } from './chartOptions';
import type { EChartsOption } from './types';

echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
  DatasetComponent,
  TransformComponent,
  CanvasRenderer,
]);

export interface EChartsRendererProps {
  option: EChartsOption | null | undefined;
  height?: number;
  fileName?: string;
  emptyMessage?: string;
}

type ChartView = 'chart' | 'table';

export function EChartsRenderer({
  option,
  height = 280,
  fileName = 'midas-copiloto',
  emptyMessage = 'El agente no devolvió datos suficientes para construir la visualización.',
}: EChartsRendererProps) {
  const chartRef = useRef<ReactEChartsCore>(null);
  const [view, setView] = useState<ChartView>('chart');

  const normalizedOption = useMemo(() => normalizeEChartsOption(option), [option]);
  const table = useMemo(() => optionToTable(option), [option]);
  const hasData = hasChartSeriesData(normalizedOption);

  const exportPng = () => {
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return;
    const dataUrl = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#0B0F17' });
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${fileName}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const canExport = hasData && view === 'chart';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70" data-testid="echarts-renderer">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-900/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="truncate text-[11px] font-semibold text-slate-200">Apache ECharts</span>
          <span className="hidden rounded bg-slate-950/80 px-1.5 py-0.5 font-mono text-[9px] text-slate-500 sm:inline">
            {view === 'chart' ? 'chart' : 'raw-data'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950/80 p-0.5">
            <button
              type="button"
              onClick={() => setView('chart')}
              aria-pressed={view === 'chart'}
              data-testid="echarts-view-chart"
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition ${
                view === 'chart' ? 'bg-indigo-950 text-indigo-300' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <BarChart3 className="h-3 w-3" />
              Gráfico
            </button>
            <button
              type="button"
              onClick={() => setView('table')}
              aria-pressed={view === 'table'}
              data-testid="echarts-view-table"
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition ${
                view === 'table' ? 'bg-indigo-950 text-indigo-300' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Table2 className="h-3 w-3" />
              Tabla
            </button>
          </div>
          <button
            type="button"
            onClick={exportPng}
            disabled={!canExport}
            data-testid="echarts-export-png"
            title="Exportar gráfico en PNG"
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:border-amber-500/50 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            PNG
          </button>
        </div>
      </div>

      {view === 'chart' ? (
        hasData && normalizedOption ? (
          <div style={{ height }} data-testid="echarts-chart-container">
            <ReactEChartsCore
              ref={chartRef}
              echarts={echarts}
              option={normalizedOption}
              notMerge
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          </div>
        ) : (
          <div
            className="flex items-center justify-center px-4 text-center text-[11px] text-slate-500"
            style={{ height }}
            data-testid="echarts-empty-state"
          >
            {emptyMessage}
          </div>
        )
      ) : (
        <div className="max-h-[280px] overflow-auto" data-testid="echarts-table-container">
          {table.rows.length > 0 ? (
            <table className="w-full border-collapse text-left text-[11px]" data-testid="echarts-data-table">
              <thead className="sticky top-0 bg-slate-900/95">
                <tr>
                  {table.columns.map((column, index) => (
                    <th
                      key={`${column}-${index}`}
                      className="whitespace-nowrap border-b border-slate-800 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-400"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`cell-${rowIndex}-${cellIndex}`}
                        className={`whitespace-nowrap px-3 py-1.5 ${
                          cellIndex === 0 ? 'text-slate-300' : 'text-right font-mono text-slate-400'
                        }`}
                      >
                        {cellIndex === 0 ? String(cell ?? '—') : formatChartValue(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-center text-[11px] text-slate-500">
              No hay datos crudos disponibles para esta respuesta.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
