import { AxiosError } from 'axios';
import { api } from './client';

/**
 * Documentation sections. The current model is a runbook/Diátaxis hybrid; the
 * legacy keys (objective/triggers/actions) appear only on documentation
 * generated before the redesign. All optional so both shapes render safely.
 */
export interface DocumentationSections {
  overview?: string;
  prerequisites?: string;
  trigger?: string;
  walkthrough?: string;
  dataFlow?: string;
  decisions?: string;
  errorHandling?: string;
  // Legacy keys.
  objective?: string;
  triggers?: string;
  actions?: string;
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
