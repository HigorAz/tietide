import type { Workflow, WorkflowDefinition } from '@tietide/shared';
import { api } from './client';

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
}

export async function listWorkflows(): Promise<Workflow[]> {
  const { data } = await api.get<Workflow[]>('/workflows');
  return data;
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
