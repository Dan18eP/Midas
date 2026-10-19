/**
 * Midas Canvas — Canonical TypeScript Data Models & Types
 * Synchronized with src/core/telemetry/events.py and canonical specifications 04 & 05.
 */

export type NodeStatus =
  | 'HEALTHY'
  | 'RUNNING'
  | 'DEGRADED'
  | 'ERROR'
  | 'IN_PROGRESS'
  | 'AUTO_HEALING'
  | 'UNKNOWN';

export type AnomalyType =
  | 'F1_DUPLICATE_KEY'
  | 'F2_VOLUME_SPIKE'
  | 'F3_NEGATIVE_AMOUNT'
  | 'F4_SCHEMA_DRIFT'
  | 'F5_ORPHAN_FOREIGN_KEY';

export interface GuardianDetails {
  anomaly_type?: AnomalyType;
  playbook_id?: string;
  action_taken?: string;
  quarantined_records?: number;
  message?: string;
}

export type MidasNodeType = 'source' | 'stage' | 'guardian';

export type MidasNodeSubtype =
  | 'postgresql'
  | 'excel'
  | 'api'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'guardian';

export interface MidasNodeData {
  id: string;
  label: string;
  description: string;
  nodeType: MidasNodeType;
  subType: MidasNodeSubtype;
  status: NodeStatus;
  recordsIn?: number;
  recordsOut?: number;
  latencyMs?: number;
  lastUpdated?: string;
  storagePath?: string;
  catalogTable?: string;
  quarantinedRecords?: number;
  guardianDetails?: GuardianDetails;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NodeStatusConfig {
  label: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  dotClass: string;
  glowClass: string;
  accessibleDescription: string;
}

export const NODE_STATUS_REGISTRY: Record<NodeStatus, NodeStatusConfig> = {
  HEALTHY: {
    label: 'Saludable',
    bgClass: 'bg-emerald-950/40',
    borderClass: 'border-emerald-500/60',
    textClass: 'text-emerald-400',
    dotClass: 'bg-emerald-400',
    glowClass: 'shadow-[0_0_15px_rgba(16,185,129,0.25)]',
    accessibleDescription: 'Nodo funcionando con parámetros nominales y contratos aprobados.',
  },
  RUNNING: {
    label: 'En Ejecución',
    bgClass: 'bg-sky-950/40',
    borderClass: 'border-sky-500/60',
    textClass: 'text-sky-400',
    dotClass: 'bg-sky-400 animate-pulse',
    glowClass: 'shadow-[0_0_15px_rgba(14,165,233,0.25)]',
    accessibleDescription: 'Tarea activa procesando lote de datos en tiempo real.',
  },
  IN_PROGRESS: {
    label: 'En Progreso',
    bgClass: 'bg-cyan-950/40',
    borderClass: 'border-cyan-500/60',
    textClass: 'text-cyan-400',
    dotClass: 'bg-cyan-400 animate-pulse',
    glowClass: 'shadow-[0_0_15px_rgba(6,182,212,0.25)]',
    accessibleDescription: 'Fase intermedia de validación de calidad o checkpoint.',
  },
  DEGRADED: {
    label: 'Degradado',
    bgClass: 'bg-amber-950/40',
    borderClass: 'border-amber-500/70',
    textClass: 'text-amber-400',
    dotClass: 'bg-amber-400 animate-ping',
    glowClass: 'shadow-[0_0_18px_rgba(245,158,11,0.35)]',
    accessibleDescription: 'Operación con desvío no bloqueante o filas en cuarentena.',
  },
  AUTO_HEALING: {
    label: 'Auto-Sanación',
    bgClass: 'bg-orange-950/40',
    borderClass: 'border-orange-500/80',
    textClass: 'text-orange-400',
    dotClass: 'bg-orange-400 animate-pulse',
    glowClass: 'shadow-[0_0_20px_rgba(249,115,22,0.45)]',
    accessibleDescription: 'Midas Guardian ejecutando playbook de remediación activa.',
  },
  ERROR: {
    label: 'Error Crítico',
    bgClass: 'bg-rose-950/40',
    borderClass: 'border-rose-500/80',
    textClass: 'text-rose-400',
    dotClass: 'bg-rose-400',
    glowClass: 'shadow-[0_0_20px_rgba(244,63,94,0.45)]',
    accessibleDescription: 'Fallo crítico de contrato o esquema con promoción bloqueada.',
  },
  UNKNOWN: {
    label: 'No Disponible',
    bgClass: 'bg-slate-900/40',
    borderClass: 'border-slate-700/60',
    textClass: 'text-slate-400',
    dotClass: 'bg-slate-500',
    glowClass: 'shadow-none',
    accessibleDescription: 'Estado del nodo aún no reportado por el Hub de telemetría.',
  },
};
