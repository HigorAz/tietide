import type { ExecutionStep, WorkflowDefinition, WorkflowExecution } from '@tietide/shared';
import { api } from './client';

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface ExecutionFilters {
  status?: ExecutionStatus;
  workflowId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
  cursor?: string;
}

export interface ExecutionListResponse {
  items: WorkflowExecution[];
  total: number;
  page: number;
  pageSize: number;
  nextCursor: string | null;
}

const buildParams = (filters: ExecutionFilters): Record<string, string | number> => {
  const params: Record<string, string | number> = {};
  if (filters.status) params.status = filters.status;
  if (filters.workflowId) params.workflowId = filters.workflowId;
  if (filters.from) params.from = filters.from.toISOString();
  if (filters.to) params.to = filters.to.toISOString();
  if (filters.page !== undefined) params.page = filters.page;
  if (filters.pageSize !== undefined) params.pageSize = filters.pageSize;
  if (filters.cursor) params.cursor = filters.cursor;
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

export async function listAllExecutions(
  filters: ExecutionFilters = {},
): Promise<ExecutionListResponse> {
  const { data } = await api.get<ExecutionListResponse>('/executions', {
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

export interface ExecuteWorkflowResponse {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  triggerType: string;
  triggerData: unknown;
  idempotencyKey: string | null;
  isDryRun?: boolean;
  createdAt: string;
}

export async function executeWorkflow(workflowId: string): Promise<ExecuteWorkflowResponse> {
  const { data } = await api.post<ExecuteWorkflowResponse>(`/workflows/${workflowId}/execute`, {});
  return data;
}

export async function testWorkflow(
  workflowId: string,
  definition: WorkflowDefinition,
  triggerData?: Record<string, unknown>,
): Promise<ExecuteWorkflowResponse> {
  const body: { definition: WorkflowDefinition; triggerData?: Record<string, unknown> } = {
    definition,
  };
  if (triggerData !== undefined) body.triggerData = triggerData;
  const { data } = await api.post<ExecuteWorkflowResponse>(`/workflows/${workflowId}/test`, body);
  return data;
}

export async function testNode(
  workflowId: string,
  nodeId: string,
  definition: WorkflowDefinition,
  triggerData?: Record<string, unknown>,
): Promise<ExecuteWorkflowResponse> {
  const body: { definition: WorkflowDefinition; triggerData?: Record<string, unknown> } = {
    definition,
  };
  if (triggerData !== undefined) body.triggerData = triggerData;
  const { data } = await api.post<ExecuteWorkflowResponse>(
    `/workflows/${workflowId}/nodes/${nodeId}/test`,
    body,
  );
  return data;
}

export interface TriggerSampleResponse {
  source: 'last-run' | 'none';
  sample: Record<string, unknown> | null;
  executionId?: string;
  capturedAt?: string;
}

/**
 * Fetch a candidate output sample for a trigger node ("Use data from last run").
 * Returns `source: 'none'` when no prior genuine run exists; the caller then
 * falls back to a built-in example. Never persists server-side.
 */
export async function getTriggerSample(
  workflowId: string,
  nodeId: string,
  definition: WorkflowDefinition,
): Promise<TriggerSampleResponse> {
  const { data } = await api.post<TriggerSampleResponse>(
    `/workflows/${workflowId}/nodes/${nodeId}/trigger-sample`,
    { definition },
  );
  return data;
}
