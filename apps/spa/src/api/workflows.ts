import type { Workflow, WorkflowDefinition } from '@tietide/shared';
import { api } from './client';

export interface UpdateWorkflowBody {
  definition: WorkflowDefinition;
  name?: string;
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const { data } = await api.get<Workflow>(`/workflows/${id}`);
  return data;
}

export async function updateWorkflow(id: string, body: UpdateWorkflowBody): Promise<Workflow> {
  const { data } = await api.patch<Workflow>(`/workflows/${id}`, body);
  return data;
}
