import type { ExecutionStep, WorkflowExecution } from '@tietide/shared';
import { api } from './client';

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface ExecutionFilters {
  status?: ExecutionStatus;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export interface ExecutionListResponse {
  items: WorkflowExecution[];
  total: number;
  page: number;
  pageSize: number;
}

const buildParams = (filters: ExecutionFilters): Record<string, string | number> => {
  const params: Record<string, string | number> = {};
  if (filters.status) params.status = filters.status;
  if (filters.from) params.from = filters.from.toISOString();
  if (filters.to) params.to = filters.to.toISOString();
  if (filters.page !== undefined) params.page = filters.page;
  if (filters.pageSize !== undefined) params.pageSize = filters.pageSize;
  return params;
};

export async function listExecutions(
  workflowId: string,
  filters: ExecutionFilters = {},
): Promise<ExecutionListResponse> {
  const { data } = await api.get<ExecutionListResponse>(`/workflows/${workflowId}/executions`, {
    params: buildParams(filters),
  });
  return data;
}

export async function getExecution(executionId: string): Promise<WorkflowExecution> {
  const { data } = await api.get<WorkflowExecution>(`/executions/${executionId}`);
  return data;
}

export async function listExecutionSteps(executionId: string): Promise<ExecutionStep[]> {
  const { data } = await api.get<ExecutionStep[]>(`/executions/${executionId}/steps`);
  return data;
}
