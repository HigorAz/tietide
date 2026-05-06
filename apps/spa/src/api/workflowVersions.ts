import { api } from './client';

export interface WorkflowVersionAuthor {
  id: string;
  email: string;
}

export interface WorkflowVersionSummary {
  id: string;
  version: number;
  message: string | null;
  createdAt: string;
  createdBy: WorkflowVersionAuthor | null;
}

export interface WorkflowVersion extends WorkflowVersionSummary {
  workflowId: string;
  definition: Record<string, unknown>;
}

export interface WorkflowVersionListResponse {
  items: WorkflowVersionSummary[];
  nextCursor: string | null;
}

export interface WorkflowVersionRestoreResponse {
  version: number;
  definition: Record<string, unknown>;
}

export interface ListWorkflowVersionsParams {
  cursor?: string;
  limit?: number;
}

export async function listWorkflowVersions(
  workflowId: string,
  params: ListWorkflowVersionsParams = {},
): Promise<WorkflowVersionListResponse> {
  const { data } = await api.get<WorkflowVersionListResponse>(`/workflows/${workflowId}/versions`, {
    params,
  });
  return data;
}

export async function getWorkflowVersion(
  workflowId: string,
  version: number,
): Promise<WorkflowVersion> {
  const { data } = await api.get<WorkflowVersion>(`/workflows/${workflowId}/versions/${version}`);
  return data;
}

export async function restoreWorkflowVersion(
  workflowId: string,
  version: number,
): Promise<WorkflowVersionRestoreResponse> {
  const { data } = await api.post<WorkflowVersionRestoreResponse>(
    `/workflows/${workflowId}/versions/${version}/restore`,
  );
  return data;
}
