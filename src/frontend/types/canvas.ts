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
    bgClass: 'bg-[#4D7C0F]/10',
    borderClass: 'border-[#4D7C0F]/30',
    textClass: 'text-[#4D7C0F]',
    dotClass: 'bg-[#4D7C0F]',
    glowClass: 'shadow-sm shadow-[#4D7C0F]/10',
    accessibleDescription: 'Nodo funcionando con parámetros nominales y contratos aprobados.',
  },
  RUNNING: {
    label: 'En Ejecución',
    bgClass: 'bg-[#EFF6FF]',
    borderClass: 'border-[#BFDBFE]',
    textClass: 'text-[#1D4ED8]',
    dotClass: 'bg-[#2563EB] animate-pulse',
    glowClass: 'shadow-sm shadow-blue-500/10',
    accessibleDescription: 'Tarea activa procesando lote de datos en tiempo real.',
  },
  IN_PROGRESS: {
    label: 'En Progreso',
    bgClass: 'bg-[#FCFAF4]',
    borderClass: 'border-[#E5DCB8]',
    textClass: 'text-[#8C6D1F]',
    dotClass: 'bg-[#D4AF37] animate-pulse',
    glowClass: 'shadow-sm shadow-amber-500/10',
    accessibleDescription: 'Fase intermedia de validación de calidad o checkpoint.',
  },
  DEGRADED: {
    label: 'Degradado',
    bgClass: 'bg-[#FFF8F5]',
    borderClass: 'border-[#ECCFC5]',
    textClass: 'text-[#A8422B]',
    dotClass: 'bg-[#C86A43] animate-ping',
    glowClass: 'shadow-sm shadow-red-500/10',
    accessibleDescription: 'Operación con desvío no bloqueante o filas en cuarentena.',
  },
  AUTO_HEALING: {
    label: 'Auto-Sanación',
    bgClass: 'bg-[#FCFAF4]',
    borderClass: 'border-[#D4AF37]',
    textClass: 'text-[#8C6D1F]',
    dotClass: 'bg-[#D4AF37] animate-pulse',
    glowClass: 'shadow-sm shadow-amber-500/10',
    accessibleDescription: 'Midas Guardian ejecutando playbook de remediación activa.',
  },
  ERROR: {
    label: 'Error Crítico',
    bgClass: 'bg-[#FFF8F5]',
    borderClass: 'border-[#ECCFC5]',
    textClass: 'text-[#A8422B]',
    dotClass: 'bg-[#A8422B]',
    glowClass: 'shadow-sm shadow-red-500/10',
    accessibleDescription: 'Fallo crítico de contrato o esquema con promoción bloqueada.',
  },
  UNKNOWN: {
    label: 'No Disponible',
    bgClass: 'bg-[#F4F1EA]',
    borderClass: 'border-[#DFD5C0]',
    textClass: 'text-[#787164]',
    dotClass: 'bg-[#BFA882]',
    glowClass: 'shadow-none',
    accessibleDescription: 'Estado del nodo aún no reportado por el Hub de telemetría.',
  },
};
