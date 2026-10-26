import type { CopilotChartTable, EChartsOption } from './types';

const AXIS_TEXT = '#6B6557';
const SPLIT_LINE = '#E8E4DC';
const TITLE_TEXT = '#1C1E21';
const TOOLTIP_CSS =
  'border-radius:10px;border:1px solid #E8E4DC;background:rgba(255,255,255,0.96);' +
  'box-shadow:0 8px 24px rgba(40,30,10,0.10);padding:8px 12px;color:#1C1E21;font-size:12px;';

const numberFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

export function formatChartValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'ÔÇö';
  if (typeof value === 'number') return Number.isFinite(value) ? numberFormatter.format(value) : 'ÔÇö';
  if (typeof value === 'string') return value;
  return String(value);
}

export function parseChartOption(raw: unknown): EChartsOption | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as EChartsOption) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as EChartsOption;
  return null;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function cloneOption(option: EChartsOption): EChartsOption {
  try {
    return JSON.parse(JSON.stringify(option)) as EChartsOption;
  } catch {
    return { ...option };
  }
}

function resolveAxis(option: EChartsOption, key: 'xAxis' | 'yAxis'): Record<string, unknown> | null {
  const axis = asArray(option[key] as Record<string, unknown> | Record<string, unknown>[] | undefined);
  return axis.length > 0 ? (axis[0] as Record<string, unknown>) : null;
}

function seriesList(option: EChartsOption): Record<string, unknown>[] {
  return asArray(option.series as Record<string, unknown> | Record<string, unknown>[] | undefined);
}

export function hasChartSeriesData(option: EChartsOption | null | undefined): boolean {
  if (!option) return false;
  const graphic = option.graphic as { style?: { text?: string } } | undefined;
  if (graphic?.style?.text) return false;
  return seriesList(option).some((item) => {
    const data = item.data as unknown[] | undefined;
    return Array.isArray(data) && data.length > 0;
  });
}

function ensureVisualMap(option: EChartsOption): void {
  const heatmap = seriesList(option).find((item) => item.type === 'heatmap');
  if (!heatmap) return;
  if (option.visualMap !== undefined) return;
  const values = (Array.isArray(heatmap.data) ? heatmap.data : [])
    .map((point) => (Array.isArray(point) ? point[point.length - 1] : point))
    .filter((value) => typeof value === 'number') as number[];
  if (values.length === 0) return;
  option.visualMap = {
    min: Math.min(...values),
    max: Math.max(...values),
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: 0,
    textStyle: { color: AXIS_TEXT },
    inRange: { color: ['#0F766E', '#14B8A6', '#F59E0B'] },
  };
}

function ensureGridAndTooltip(option: EChartsOption): void {
  const series = seriesList(option);
  if (series.length === 0) return;

  const existingGrid = (option.grid as Record<string, unknown> | undefined) ?? {};
  option.grid = {
    left: 20,
    right: 24,
    top: 50,
    bottom: 52,
    containLabel: true,
    ...existingGrid,
  };
  // Asegurar que containLabel esté activo y margen inferior sea suficiente para etiquetas diagonales
  const g = option.grid as Record<string, unknown>;
  g.containLabel = true;
  if (g.bottom === '25%' || g.bottom === 16 || g.bottom === undefined) {
    g.bottom = 52;
  }

  const isHeatmap = series.some((item) => item.type === 'heatmap');
  const isBar = series.some((item) => item.type === 'bar');
  const existing = (option.tooltip as Record<string, unknown> | undefined) ?? {};
  option.tooltip = {
    trigger: isHeatmap ? 'item' : 'axis',
    ...existing,
    confine: true,
    renderMode: 'html',
    extraCssText: TOOLTIP_CSS,
    valueFormatter: (value: unknown) => formatChartValue(value),
    axisPointer: {
      type: isBar ? 'shadow' : isHeatmap ? 'shadow' : 'line',
      ...((existing.axisPointer as Record<string, unknown> | undefined) ?? {}),
    },
  };
}

function ensureDarkTheme(option: EChartsOption): void {
  const textStyle = (option.textStyle as Record<string, unknown> | undefined) ?? {};
  option.textStyle = { color: '#1C1E21', fontFamily: 'inherit', ...textStyle };

  const title = (option.title as Record<string, unknown> | undefined) ?? {};
  if (option.title !== undefined) {
    option.title = {
      ...title,
      textStyle: { color: TITLE_TEXT, fontSize: 13, fontWeight: 600, ...(title.textStyle as object) },
      left: title.left ?? 'left',
    };
  }

  const legend = (option.legend as Record<string, unknown> | undefined) ?? {};
  if (option.legend !== undefined) {
    option.legend = { ...legend, textStyle: { color: AXIS_TEXT, ...(legend.textStyle as object) } };
  }

  asArray(option.xAxis as Record<string, unknown> | Record<string, unknown>[] | undefined).forEach((axis) => {
    axis.axisLabel = { color: AXIS_TEXT, ...(axis.axisLabel as object) };
    axis.axisLine = { lineStyle: { color: SPLIT_LINE }, ...(axis.axisLine as object) };
    axis.splitLine = { lineStyle: { color: SPLIT_LINE }, ...(axis.splitLine as object) };
  });

  asArray(option.yAxis as Record<string, unknown> | Record<string, unknown>[] | undefined).forEach((axis) => {
    if (axis.type === 'value' || !axis.type) {
      if (axis.min === undefined) axis.min = 0;
      if (axis.splitNumber === undefined) axis.splitNumber = 4;
    }
    axis.axisLabel = { color: AXIS_TEXT, margin: 8, ...(axis.axisLabel as object) };
    axis.axisLine = { lineStyle: { color: SPLIT_LINE }, ...(axis.axisLine as object) };
    axis.splitLine = { lineStyle: { color: SPLIT_LINE }, ...(axis.splitLine as object) };
  });

  // Limitar ancho máximo en series de barra para evitar que una barra solitaria aplastada ocupe todo el gráfico
  seriesList(option).forEach((s) => {
    if (s.type === 'bar') {
      const data = s.data as unknown[] | undefined;
      if (Array.isArray(data) && data.length <= 2 && s.barMaxWidth === undefined) {
        s.barMaxWidth = 64;
      }
    }
  });
}

export function normalizeEChartsOption(raw: unknown): EChartsOption | null {
  const option = parseChartOption(raw);
  if (!option) return null;
  const normalized = cloneOption(option);
  if (normalized.animation === undefined) normalized.animationDuration = 400;
  ensureGridAndTooltip(normalized);
  ensureVisualMap(normalized);
  ensureDarkTheme(normalized);
  return normalized;
}

function valueAt(data: unknown, index: number): unknown {
  if (!Array.isArray(data)) return null;
  const value = data[index];
  if (value === undefined) return null;
  if (Array.isArray(value)) return value[value.length - 1] ?? null;
  return value;
}

function axisLabelAt(axis: Record<string, unknown>, value: unknown): string {
  const data = axis.data as unknown[] | undefined;
  if (Array.isArray(data) && typeof value === 'number' && data[value] !== undefined) {
    return formatChartValue(data[value]);
  }
  return formatChartValue(value);
}

export function optionToTable(raw: unknown): CopilotChartTable {
  const option = parseChartOption(raw);
  if (!option) return { columns: [], rows: [] };

  const xAxis = resolveAxis(option, 'xAxis');
  const yAxis = resolveAxis(option, 'yAxis');
  const series = seriesList(option);
  const seriesNames = series.map((item, index) => String(item.name ?? `Serie ${index + 1}`));

  const heatmap = series.find((item) => item.type === 'heatmap');
  if (heatmap && xAxis && yAxis) {
    const xName = String(xAxis.name ?? 'X');
    const yName = String(yAxis.name ?? 'Y');
    const valueName = String(heatmap.name ?? 'Valor');
    const points = Array.isArray(heatmap.data) ? heatmap.data : [];
    return {
      columns: [xName, yName, valueName],
      rows: points.map((point) => {
        const tuple = Array.isArray(point) ? point : [point];
        const [x, y, value] = tuple;
        return [axisLabelAt(xAxis, x), axisLabelAt(yAxis, y), value ?? null] as (string | number | null)[];
      }),
    };
  }

  if (xAxis && Array.isArray(xAxis.data) && xAxis.data.length > 0) {
    const rows = xAxis.data.map((category, index) => [
      formatChartValue(category),
      ...series.map((item) => valueAt(item.data, index) as string | number | null),
    ]);
    const normalizedRows = rows.map((row) =>
      row.map((cell, columnIndex) => (columnIndex === 0 ? cell : formatChartValue(cell))),
    );
    return {
      columns: [String(xAxis.name ?? 'Categor├¡a'), ...seriesNames],
      rows: normalizedRows.map((row) => row.map((cell) => (cell === 'ÔÇö' ? null : cell))),
    };
  }

  if (yAxis && Array.isArray(yAxis.data) && yAxis.data.length > 0) {
    const rows = yAxis.data.map((category, index) => [
      formatChartValue(category),
      ...series.map((item) => formatChartValue(valueAt(item.data, index))),
    ]);
    return {
      columns: [String(yAxis.name ?? 'Categor├¡a'), ...seriesNames],
      rows: rows.map((row) => row.map((cell) => (cell === 'ÔÇö' ? null : cell))),
    };
  }

  const paired = series.find((item) => Array.isArray(item.data) && item.data.length > 0);
  if (paired && Array.isArray(paired.data)) {
    const xName = String(xAxis?.name ?? 'X');
    const yName = String(yAxis?.name ?? paired.name ?? 'Y');
    const rows = paired.data
      .filter((point) => Array.isArray(point))
      .map((point) => {
        const tuple = point as unknown[];
        return [tuple[0] ?? null, tuple[tuple.length - 1] ?? null] as (string | number | null)[];
      });
    return { columns: [xName, yName], rows };
  }

  return { columns: [], rows: [] };
}
