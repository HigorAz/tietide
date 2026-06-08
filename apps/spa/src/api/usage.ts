import { api } from './client';

export type UsageRange = '7d' | '30d' | '90d';

export interface RunsPerDayPoint {
  date: string; // UTC YYYY-MM-DD
  count: number;
  failed: number;
}

export interface TopWorkflow {
  id: string;
  name: string;
  runs: number;
  successRate: number; // 0..1
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface TriggerCount {
  triggerType: string;
  count: number;
}

export interface BusiestHour {
  hour: number; // 0..23 UTC
  count: number;
}

export interface RecentFailure {
  id: string;
  workflowId: string;
  workflowName: string;
  error: string | null;
  finishedAt: string | null; // ISO
  createdAt: string; // ISO
}

export interface ConnectionHealth {
  status: string;
  count: number;
}

export interface NodeFailure {
  nodeType: string;
  failures: number;
  avgDurationMs: number;
}

export interface PeriodComparison {
  totalRunsDelta: number | null; // relative; null when prior window empty
  successRateDelta: number; // absolute point change
  avgDurationDelta: number | null; // relative; null when prior window empty
}

export interface UsageSummary {
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  activeWorkflows: number;
  runsPerDay: RunsPerDayPoint[];
  topWorkflows: TopWorkflow[];
  statusBreakdown: StatusCount[];
  triggerDistribution: TriggerCount[];
  busiestHours: BusiestHour[];
  recentFailures: RecentFailure[];
  connectionHealth: ConnectionHealth[];
  nodeFailures: NodeFailure[];
  comparison: PeriodComparison;
}

export async function getUsageSummary(range: UsageRange = '7d'): Promise<UsageSummary> {
  const { data } = await api.get<UsageSummary>('/usage/summary', { params: { range } });
  return data;
}
