import type { LineageStageNode } from './types';

export interface CanonicalMetricDefinition {
  key: string;
  label: string;
  latex: string;
  plain: string;
  description: string;
  recognition: RegExp;
  transformation: string;
  stages: LineageStageNode[];
}

const PEDIDOS_STAGES: LineageStageNode[] = [
  {
    layer: 'source',
    title: 'Fuente Original',
    table: 'public.pedidos_crm',
    location: 'midas-postgres:5432/midas_operational',
    detail: 'PostgreSQL operacional ingerido por Universal Ingestion Engine (JDBC).',
  },
  {
    layer: 'bronze',
    title: 'Bronze Parquet',
    table: 'bronze.pedidos_raw',
    location: 's3://midas-bronze/pedidos_raw/',
    detail: 'Iceberg v2 Parquet append-only con columnas de auditoría (_ingested_at, _schema_fingerprint).',
  },
  {
    layer: 'silver',
    title: 'Silver Cleanse',
    table: 'silver.pedidos',
    location: 's3://midas-silver/pedidos/',
    detail: 'Limpieza PySpark, Quality Gate de contratos y bifurcación a silver.pedidos_quarantine.',
  },
  {
    layer: 'gold',
    title: 'Gold Mart',
    table: 'gold.fact_ventas',
    location: 's3://midas-gold/fact_ventas/',
    detail: 'Mart dimensional Kimball con promoción Write-Audit-Publish verificada por Midas Guardian.',
  },
];

const TRANSACCIONES_STAGES: LineageStageNode[] = [
  {
    layer: 'source',
    title: 'Fuente Original',
    table: 'public.transacciones_crm',
    location: 'midas-postgres:5432/midas_operational',
    detail: 'Tabla relacional de transacciones del CRM conectada vía JDBC PostgreSQL.',
  },
  {
    layer: 'bronze',
    title: 'Bronze Parquet',
    table: 'bronze.crm_transacciones_raw',
    location: 's3://midas-bronze/crm_transacciones_raw/',
    detail: 'Envoltorio universal de ingesta con _raw_payload JSON original preservado.',
  },
  {
    layer: 'silver',
    title: 'Silver Cleanse',
    table: 'silver.crm_transacciones',
    location: 's3://midas-silver/crm_transacciones/',
    detail: 'Normalización snake_case, tipado estricto y Escudo PII con Apache Atlas/Ranger.',
  },
  {
    layer: 'gold',
    title: 'Gold Mart',
    table: 'gold.fact_ventas',
    location: 's3://midas-gold/fact_ventas/',
    detail: 'Agregación de hechos de venta para consumo ejecutivo del Copiloto y Trino.',
  },
];

export const CANONICAL_METRICS: CanonicalMetricDefinition[] = [
  {
    key: 'venta_bruta',
    label: 'Venta Bruta',
    latex: '\\sum(\\text{cantidad} \\times \\text{precio\\_unitario})',
    plain: 'SUM(cantidad × precio_unitario)',
    description: 'Suma del valor bruto de los pedidos en estado ENTREGADO o EN_TRANSITO.',
    recognition: /(venta\s*bruta|gross\s*sales|monto\s*bruto)/i,
    transformation: 'Agregación sobre silver.pedidos con filtro de estado ENTREGADO o EN_TRANSITO.',
    stages: PEDIDOS_STAGES,
  },
  {
    key: 'venta_neta',
    label: 'Venta Neta',
    latex: '\\sum(\\text{monto\\_bruto} - \\text{descuento} - \\text{devoluciones})',
    plain: 'SUM(monto_bruto − descuento − devoluciones)',
    description: 'Cifra oficial para toda pregunta sobre ventas o ingresos (Diccionario Semántico Inmutable).',
    recognition: /(venta\s*neta|ingresos?|net\s*sales|revenue)/i,
    transformation: "Agregación de silver.pedidos con filtro estado = 'ENTREGADO' y exclusión de devoluciones.",
    stages: PEDIDOS_STAGES,
  },
  {
    key: 'pedidos_validos',
    label: 'Pedidos Válidos',
    latex: '\\text{COUNT}(\\text{DISTINCT } \\text{pedido\\_id})',
    plain: 'COUNT(DISTINCT pedido_id)',
    description: 'Cuenta de pedidos únicos, excluyendo cancelaciones previas al despacho.',
    recognition: /(pedidos?\s*v[aá]lidos?|orden(?:es)?\s*v[aá]lidas?|valid\s*orders)/i,
    transformation: 'Conteo distinto de pedido_id en silver.pedidos excluyendo cancelaciones previas al despacho.',
    stages: PEDIDOS_STAGES,
  },
  {
    key: 'ticket_promedio',
    label: 'Ticket Promedio',
    latex: '\\frac{\\text{Venta Neta}}{\\text{Pedidos Válidos}}',
    plain: 'Venta Neta ÷ Pedidos Válidos',
    description: 'Valor medio por pedido válido. Si el denominador es 0, retorna 0.00 según la regla canónica.',
    recognition: /(ticket\s*promedio|average\s*ticket|ticket\s*medio|valor\s*promedio)/i,
    transformation: 'División de la Venta Neta certificada entre el conteo de Pedidos Válidos del mismo periodo.',
    stages: PEDIDOS_STAGES,
  },
  {
    key: 'tasa_devolucion',
    label: 'Tasa de Devolución',
    latex: '\\frac{\\text{Pedidos Devueltos}}{\\text{Total Pedidos Entregados}} \\times 100',
    plain: '(Pedidos Devueltos ÷ Total Pedidos Entregados) × 100',
    description: 'Porcentaje de devoluciones calculado por cohorte mensual.',
    recognition: /(tasa\s*de\s*devoluci[oó]n|devoluciones?\s*(?:%|por\s*centaje)?|return\s*rate)/i,
    transformation: 'Cociente de pedidos devueltos sobre pedidos entregados de la misma cohorte mensual, en porcentaje.',
    stages: PEDIDOS_STAGES,
  },
  {
    key: 'cumplimiento_presupuesto',
    label: 'Cumplimiento de Presupuesto',
    latex: '\\frac{\\text{Ingreso Real}}{\\text{Meta Ingresos Presupuestada}} \\times 100',
    plain: '(Ingreso Real ÷ Meta Presupuestada) × 100',
    description: 'Comparación porcentual entre ingresos certificados en Gold y la meta del Excel corporativo.',
    recognition: /(cumplimiento|presupuesto|budget|meta\s*de\s*ingreso)/i,
    transformation: 'Cruce de gold.fact_ventas con silver.finanzas_metas_presupuesto por año, mes, región y canal.',
    stages: [
      {
        layer: 'source',
        title: 'Fuente Original',
        table: 'Presupuesto_Corporativo_2026.xlsx',
        location: 's3://midas-governance/metas_comerciales_2026.xlsx',
        detail: 'Hoja Presupuesto_Metas del libro corporativo multi-pestaña.',
      },
      {
        layer: 'bronze',
        title: 'Bronze Parquet',
        table: 'bronze.presupuesto_metas_raw',
        location: 's3://midas-bronze/presupuesto_metas_raw/',
        detail: 'Ingesta Excel con OpenPyXL preservando el payload original.',
      },
      {
        layer: 'silver',
        title: 'Silver Cleanse',
        table: 'silver.finanzas_metas_presupuesto',
        location: 's3://midas-silver/finanzas_metas_presupuesto/',
        detail: 'Tipado de metas por año, mes, región y canal_venta con Quality Gate aprobado.',
      },
      {
        layer: 'gold',
        title: 'Gold Mart',
        table: 'gold.fact_ventas',
        location: 's3://midas-gold/fact_ventas/',
        detail: 'Cruce certificado contra hechos de venta reales para el semáforo ejecutivo.',
      },
    ],
  },
];

export const CANONICAL_METRICS_BY_KEY: Record<string, CanonicalMetricDefinition> = Object.fromEntries(
  CANONICAL_METRICS.map((metric) => [metric.key, metric]),
);

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchCanonicalMetric(label: string | null | undefined): CanonicalMetricDefinition | null {
  if (!label) return null;
  const normalized = normalizeText(label);
  return CANONICAL_METRICS.find((metric) => metric.recognition.test(normalized)) ?? null;
}
