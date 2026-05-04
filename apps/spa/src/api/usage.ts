import { api } from './client';

export type UsageRange = '7d' | '30d' | '90d';

export interface RunsPerDayPoint {
  date: string; // UTC YYYY-MM-DD
  count: number;
}

export interface TopWorkflow {
  id: string;
  name: string;
  runs: number;
  successRate: number; // 0..1
}

export interface UsageSummary {
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  activeWorkflows: number;
  runsPerDay: RunsPerDayPoint[];
  topWorkflows: TopWorkflow[];
}

export async function getUsageSummary(range: UsageRange = '7d'): Promise<UsageSummary> {
  const { data } = await api.get<UsageSummary>('/usage/summary', { params: { range } });
  return data;
}
