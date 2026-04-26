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
  cached: boolean;
  generatedAt: string;
}

export async function generateWorkflowDocs(
  workflowId: string,
): Promise<WorkflowDocumentationResponse> {
  const { data } = await api.post<WorkflowDocumentationResponse>(
    `/workflows/${workflowId}/generate-docs`,
  );
  return data;
}
