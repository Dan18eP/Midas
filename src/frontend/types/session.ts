/**
 * Midas - Definiciones de Tipos TypeScript para Workspace Conversacional Multi-Sesión.
 *
 * Historia de Usuario: HU-FRONT-07 / ADR-010
 * Autor: Dilan Chávez (@dilandcv)
 * Conforme con los contratos de API expuestos en src/api/routes/sessions.py
 * y src/api/routes/connections.py.
 */

import type { Node, Edge } from '@xyflow/react';
import type { MidasNodeData } from './canvas';

export type SessionActiveModule = 'audit' | 'pipeline' | 'mart_gold' | 'lineage' | 'guardian';

export interface SessionMetadata {
  active_modules?: SessionActiveModule[];
  tags?: string[];
  description?: string;
  source_count?: number;
  [key: string]: unknown;
}

export interface TopologyStateDTO {
  nodes: Node<MidasNodeData>[];
  edges: Edge[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface SessionMessageItem {
  id: string;
  session_id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: {
    intent?: string;
    suggestions?: string[];
    echarts_option?: Record<string, unknown>;
    metrics_summary?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
}

export interface ChatSessionSummary {
  session_id: string;
  user_id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  metadata?: SessionMetadata;
}

export interface ChatSessionDetail {
  session_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  metadata?: SessionMetadata;
  topology_state?: TopologyStateDTO | null;
  messages: SessionMessageItem[];
}

export interface CreateSessionDTO {
  user_id?: string;
  title?: string;
  metadata?: SessionMetadata;
  topology_state?: TopologyStateDTO;
}

export type SessionDateGroup = 'today' | 'yesterday' | 'past_week' | 'older';

export interface GroupedSessions {
  group: SessionDateGroup;
  label: string;
  sessions: ChatSessionSummary[];
}

export interface FileUploadResponseDTO {
  connection_id: string;
  name: string;
  source_type: 'EXCEL' | 'CSV';
  filename: string;
  sheets: string[];
  detected_columns: string[];
  sample_rows: Array<Record<string, unknown>>;
  storage_uri?: string;
  status: string;
}

export interface RegisterConnectionDTO {
  name: string;
  source_type: 'POSTGRES' | 'MYSQL' | 'REST_API' | 'WEBHOOK' | 'EXCEL' | 'CSV';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  url?: string;
  auth_type?: string;
  auth_token?: string;
  headers?: Record<string, string>;
  description?: string;
}
