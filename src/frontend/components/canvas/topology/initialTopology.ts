import { Node, Edge, MarkerType } from '@xyflow/react';
import { MidasNodeData } from '@/types/canvas';

export const INITIAL_CANVAS_NODES: Node<MidasNodeData>[] = [
  // --- FUENTES HETEROGÉNEAS ---
  {
    id: 'source_postgres',
    type: 'source',
    position: { x: 40, y: 60 },
    data: {
      id: 'source_postgres',
      connectionId: 'conn_pg_crm_default',
      label: 'PostgreSQL CRM/ERP',
      description: 'Base de datos relacional operacional con transacciones de pedidos.',
      nodeType: 'source',
      subType: 'postgresql',
      status: 'HEALTHY',
      recordsIn: 0,
      recordsOut: 4520,
      latencyMs: 12.4,
      lastUpdated: new Date().toISOString(),
      details: {
        connectionId: 'conn_pg_crm_default',
        host: 'midas-postgres:5432',
        database: 'midas_operational',
        table: 'public.pedidos_crm',
        connector: 'Universal Ingestion JDBC',
      },
    },
  },
  {
    id: 'source_excel',
    type: 'source',
    position: { x: 40, y: 240 },
    data: {
      id: 'source_excel',
      connectionId: 'conn_excel_budget_default',
      label: 'Excel Metas Presupuesto',
      description: 'Archivos .xlsx multi-hoja con metas comerciales y presupuestos regionales.',
      nodeType: 'source',
      subType: 'excel',
      status: 'HEALTHY',
      recordsIn: 0,
      recordsOut: 320,
      latencyMs: 8.1,
      lastUpdated: new Date().toISOString(),
      details: {
        connectionId: 'conn_excel_budget_default',
        bucket: 's3://midas-governance/metas_comerciales_2026.xlsx',
        format: 'OpenPyXL Multi-sheet',
        frequency: 'Daily drop',
      },
    },
  },
  {
    id: 'source_api',
    type: 'source',
    position: { x: 40, y: 420 },
    data: {
      id: 'source_api',
      connectionId: 'conn_rest_crm_default',
      label: 'API REST Webhooks',
      description: 'Ingesta continua de eventos de pasarela de pago y logística.',
      nodeType: 'source',
      subType: 'api',
      status: 'HEALTHY',
      recordsIn: 0,
      recordsOut: 1850,
      latencyMs: 24.6,
      lastUpdated: new Date().toISOString(),
      details: {
        connectionId: 'conn_rest_crm_default',
        endpoint: '/api/v1/ingest/webhooks',
        auth: 'Bearer Token (Zero-Trust)',
        rateLimit: '1000 req/min',
      },
    },
  },

  // --- MEDALLION: BRONZE LAYER ---
  {
    id: 'bronze_raw',
    type: 'stage',
    position: { x: 400, y: 240 },
    data: {
      id: 'bronze_raw',
      label: 'Bronze Raw (Iceberg)',
      description: 'Ingesta cruda inmutable con metadatos de auditoría y esquema Iceberg v2.',
      nodeType: 'stage',
      subType: 'bronze',
      status: 'HEALTHY',
      recordsIn: 6690,
      recordsOut: 6690,
      latencyMs: 45.2,
      storagePath: 's3://midas-bronze/pedidos_raw/',
      catalogTable: 'bronze.pedidos_raw',
      lastUpdated: new Date().toISOString(),
      details: {
        format: 'Apache Iceberg v2 Parquet',
        partition: 'ingestion_date (Daily)',
        auditColumns: ['_ingested_at', '_source_type', '_schema_fingerprint'],
      },
    },
  },

  // --- MEDALLION: SILVER LAYER ---
  {
    id: 'silver_cleansing',
    type: 'stage',
    position: { x: 760, y: 240 },
    data: {
      id: 'silver_cleansing',
      label: 'Silver Cleanse (Iceberg)',
      description: 'Limpieza con PySpark, Quality Gate de contratos y bifurcación a cuarentena.',
      nodeType: 'stage',
      subType: 'silver',
      status: 'HEALTHY',
      recordsIn: 6690,
      recordsOut: 6676,
      latencyMs: 120.8,
      storagePath: 's3://midas-silver/pedidos/',
      catalogTable: 'silver.pedidos',
      quarantinedRecords: 14,
      lastUpdated: new Date().toISOString(),
      details: {
        qualityGate: 'Great Expectations & OpenMetadata Contracts',
        quarantineTable: 'silver.pedidos_quarantine',
        piiDetection: 'Apache Atlas Automated Tagging',
      },
    },
  },

  // --- RESILIENCIA: MIDAS GUARDIAN ---
  {
    id: 'guardian_monitor',
    type: 'guardian',
    position: { x: 760, y: 460 },
    data: {
      id: 'guardian_monitor',
      label: 'Midas Guardian Monitor',
      description: 'Subsistema de observabilidad activa, auto-sanación y playbooks PB-01 a PB-05.',
      nodeType: 'guardian',
      subType: 'guardian',
      status: 'HEALTHY',
      recordsIn: 14,
      recordsOut: 0,
      latencyMs: 15.0,
      lastUpdated: new Date().toISOString(),
      guardianDetails: {
        playbook_id: 'PB-03-QUARANTINE',
        action_taken: 'Standby - Monitoreando anomalías F1 a F5',
        quarantined_records: 14,
        message: 'Contrato WAP intacto. Gold protegida contra corrupción contable.',
      },
      details: {
        activePlaybooks: ['PB-01-RETRY', 'PB-02-DEDUP', 'PB-03-QUARANTINE', 'PB-04-SCHEMA', 'PB-05-ANOMALY'],
        wapPattern: 'Write-Audit-Publish Enforced',
      },
    },
  },

  // --- MEDALLION: GOLD LAYER ---
  {
    id: 'gold_marts',
    type: 'stage',
    position: { x: 1120, y: 240 },
    data: {
      id: 'gold_marts',
      label: 'Gold Marts (Iceberg)',
      description: 'Marts dimensionales de hechos y dimensiones con vistas analíticas gobernadas.',
      nodeType: 'stage',
      subType: 'gold',
      status: 'HEALTHY',
      recordsIn: 6676,
      recordsOut: 6676,
      latencyMs: 85.3,
      storagePath: 's3://midas-gold/fact_ventas/',
      catalogTable: 'gold.fact_ventas',
      lastUpdated: new Date().toISOString(),
      details: {
        dimensions: ['dim_clientes', 'dim_productos', 'dim_tiempo'],
        queryEngine: 'Trino 440+ con Plugin Apache Ranger',
        governanceAudit: '100% Contratos de Datos Certificados',
      },
    },
  },
];

export const INITIAL_CANVAS_EDGES: Edge[] = [
  // De Fuentes a Bronze
  {
    id: 'edge_postgres_bronze',
    source: 'source_postgres',
    target: 'bronze_raw',
    type: 'dataflow',
    animated: true,
    style: { stroke: '#2563EB', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#2563EB' },
    data: { label: '4,520 r/s', volume: 4520, status: 'HEALTHY' },
  },
  {
    id: 'edge_excel_bronze',
    source: 'source_excel',
    target: 'bronze_raw',
    type: 'dataflow',
    animated: true,
    style: { stroke: '#2563EB', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#2563EB' },
    data: { label: '320 r/s', volume: 320, status: 'HEALTHY' },
  },
  {
    id: 'edge_api_bronze',
    source: 'source_api',
    target: 'bronze_raw',
    type: 'dataflow',
    animated: true,
    style: { stroke: '#2563EB', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#2563EB' },
    data: { label: '1,850 r/s', volume: 1850, status: 'HEALTHY' },
  },

  // De Bronze a Silver
  {
    id: 'edge_bronze_silver',
    source: 'bronze_raw',
    target: 'silver_cleansing',
    type: 'dataflow',
    animated: true,
    style: { stroke: '#3B82F6', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#3B82F6' },
    data: { label: 'Spark Cleanse', volume: 6690, status: 'HEALTHY' },
  },

  // De Silver a Gold
  {
    id: 'edge_silver_gold',
    source: 'silver_cleansing',
    target: 'gold_marts',
    type: 'dataflow',
    animated: true,
    style: { stroke: '#B8860B', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#B8860B' },
    data: { label: 'WAP Verified', volume: 6676, status: 'HEALTHY', isWap: true },
  },

  // De Silver a Guardian (Cuarentena y telemetría de resiliencia)
  {
    id: 'edge_silver_guardian',
    source: 'silver_cleansing',
    target: 'guardian_monitor',
    type: 'dataflow',
    animated: true,
    style: { stroke: '#C86A43', strokeWidth: 1.5, strokeDasharray: '4 4' },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#C86A43' },
    data: { label: 'Cuarentena', volume: 14, status: 'DEGRADED' },
  },

  // De Guardian a Gold (Aprobación WAP)
  {
    id: 'edge_guardian_gold',
    source: 'guardian_monitor',
    target: 'gold_marts',
    type: 'dataflow',
    animated: false,
    style: { stroke: '#D4AF37', strokeWidth: 1.2, strokeDasharray: '3 3' },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#D4AF37' },
    data: { label: 'Gatekeeper', volume: 0, status: 'HEALTHY' },
  },
];
