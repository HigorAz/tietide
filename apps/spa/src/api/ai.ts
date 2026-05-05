import { AxiosError } from 'axios';
import { api } from './client';

export interface DocumentationSections {
  objective: string;
  triggers: string;
  actions: string;
  dataFlow: string;
  decisions: string;
}

export interface WorkflowDocumentationResponse {
  workflowId: string;
  version: number;
  documentation: string;
  sections: DocumentationSections;
  model: string;
  generatedAt: string;
}

export async function getWorkflowDocs(
  workflowId: string,
): Promise<WorkflowDocumentationResponse | null> {
  try {
    const { data } = await api.get<WorkflowDocumentationResponse>(
      `/workflows/${workflowId}/documentation`,
    );
    return data;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function regenerateWorkflowDocs(
  workflowId: string,
): Promise<WorkflowDocumentationResponse> {
  const { data } = await api.post<WorkflowDocumentationResponse>(
    `/workflows/${workflowId}/documentation/regenerate`,
  );
  return data;
}
