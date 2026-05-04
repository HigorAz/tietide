import type { Workflow } from '@tietide/shared';
import { api } from './client';

export interface WorkflowTemplate {
  slug: string;
  name: string;
  description: string;
  category: string;
  nodeTypes: string[];
}

export async function listTemplates(): Promise<WorkflowTemplate[]> {
  const { data } = await api.get<WorkflowTemplate[]>('/library/templates');
  return data;
}

export async function instantiateTemplate(slug: string): Promise<Workflow> {
  const { data } = await api.post<Workflow>(
    `/library/templates/${encodeURIComponent(slug)}/instantiate`,
  );
  return data;
}
