import type { Workflow, WorkflowDefinition } from '@tietide/shared';
import { api } from './client';
import { fetchAllPages } from './pagination';

/**
 * List-view projection of a workflow. The `GET /v1/workflows` list endpoint omits
 * the heavy `definition` JSONB (W3.2); the editor loads it via `getWorkflow(id)`.
 */
export type WorkflowListItem = Omit<Workflow, 'definition'>;

export interface CreateWorkflowBody {
  name: string;
  description?: string | null;
  definition: WorkflowDefinition;
}

export interface UpdateWorkflowBody {
  name?: string;
  description?: string | null;
  definition?: WorkflowDefinition;
  isActive?: boolean;
  folderId?: string | null;
  tagIds?: string[];
}

export interface ListWorkflowsParams {
  /** UUID, null for root, or undefined for no filter. */
  folderId?: string | null;
  tagIds?: string[];
}

export async function listWorkflows(params: ListWorkflowsParams = {}): Promise<WorkflowListItem[]> {
  const query: Record<string, string> = {};
  if (params.folderId !== undefined) {
    query.folderId = params.folderId === null ? 'null' : params.folderId;
  }
  if (params.tagIds && params.tagIds.length > 0) {
    query.tagIds = params.tagIds.join(',');
  }
  return fetchAllPages<WorkflowListItem>('/workflows', query);
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const { data } = await api.get<Workflow>(`/workflows/${id}`);
  return data;
}

export async function createWorkflow(body: CreateWorkflowBody): Promise<Workflow> {
  const { data } = await api.post<Workflow>('/workflows', body);
  return data;
}

export async function updateWorkflow(id: string, body: UpdateWorkflowBody): Promise<Workflow> {
  const { data } = await api.patch<Workflow>(`/workflows/${id}`, body);
  return data;
}

export async function toggleWorkflowActive(id: string, isActive: boolean): Promise<Workflow> {
  const { data } = await api.patch<Workflow>(`/workflows/${id}`, { isActive });
  return data;
}

export async function deleteWorkflow(id: string): Promise<void> {
  await api.delete(`/workflows/${id}`);
}
