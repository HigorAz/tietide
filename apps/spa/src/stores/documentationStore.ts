import { create } from 'zustand';
import { AxiosError } from 'axios';
import { generateWorkflowDocs as apiGenerate, type WorkflowDocumentationResponse } from '@/api/ai';

export type DocumentationStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DocumentationState {
  status: DocumentationStatus;
  docs: WorkflowDocumentationResponse | null;
  error: string | null;
}

export interface DocumentationActions {
  generate: (workflowId: string) => Promise<void>;
  reset: () => void;
}

export type DocumentationStore = DocumentationState & DocumentationActions;

const initialState: DocumentationState = {
  status: 'idle',
  docs: null,
  error: null,
};

const toMessage = (err: unknown): string => {
  if (err instanceof AxiosError && err.response) {
    const data = err.response.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (err.response.status === 503) return 'AI service temporarily unavailable';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Failed to generate documentation';
};

export const useDocumentationStore = create<DocumentationStore>((set) => ({
  ...initialState,

  generate: async (workflowId) => {
    set({ status: 'loading', error: null });
    try {
      const docs = await apiGenerate(workflowId);
      set({ status: 'ready', docs, error: null });
    } catch (err) {
      set({ status: 'error', docs: null, error: toMessage(err) });
    }
  },

  reset: () => set({ ...initialState }),
}));
