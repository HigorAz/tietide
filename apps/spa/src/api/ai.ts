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

/**
 * Persist a human-edited documentation body. Returns the saved row (with the
 * `model` flipped to `manual` and a fresh `generatedAt`).
 */
export async function saveWorkflowDocs(
  workflowId: string,
  documentation: string,
): Promise<WorkflowDocumentationResponse> {
  const { data } = await api.patch<WorkflowDocumentationResponse>(
    `/workflows/${workflowId}/documentation`,
    { documentation },
  );
  return data;
}

export interface DocumentationRegenerationAccepted {
  workflowId: string;
  status: 'pending';
}

/**
 * Start documentation generation. Returns 202 immediately — generation runs in
 * the background (it can take minutes on a CPU-only model, past edge proxy
 * timeouts), so callers poll {@link getWorkflowDocs} for the finished result.
 */
export async function startWorkflowDocsRegeneration(
  workflowId: string,
): Promise<DocumentationRegenerationAccepted> {
  const { data } = await api.post<DocumentationRegenerationAccepted>(
    `/workflows/${workflowId}/documentation/regenerate`,
  );
  return data;
}
