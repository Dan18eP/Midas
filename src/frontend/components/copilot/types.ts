export type EChartsOption = Record<string, unknown>;

export type CopilotRole = 'user' | 'assistant';

export type CopilotAgentStatus = 'idle' | 'thinking' | 'querying' | 'visualizing' | 'error';

export type CopilotApprovalState = 'idle' | 'submitting' | 'approved' | 'failed';

export interface CopilotMetricSummary {
  label?: string;
  name?: string;
  value?: string | number | null;
  unit?: string;
  description?: string;
  [key: string]: unknown;
}

export interface CopilotMessage {
  id: string;
  role: CopilotRole;
  content: string;
  timestamp: string;
  intent?: string | null;
  needsClarification?: boolean;
  suggestions?: string[];
  echartsOption?: EChartsOption | null;
  metricsSummary?: CopilotMetricSummary[];
  textToGold?: boolean;
  approvalState?: CopilotApprovalState;
  sql?: string;
  error?: boolean;
}

export interface CopilotChatResponse {
  thread_id: string;
  intent?: string | null;
  response: string;
  suggestions?: string[];
  needs_clarification?: boolean;
  echarts_option?: EChartsOption | null;
  echarts_spec?: EChartsOption | null;
  metrics_summary?: CopilotMetricSummary[];
  sql?: string;
  timestamp?: string;
}

export interface CopilotChartTable {
  columns: string[];
  rows: (string | number | null)[][];
}
