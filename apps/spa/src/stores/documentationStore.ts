import { create } from 'zustand';
import { AxiosError } from 'axios';
import {
  getWorkflowDocs,
  regenerateWorkflowDocs,
  type WorkflowDocumentationResponse,
} from '@/api/ai';

export type DocumentationStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DocumentationState {
  status: DocumentationStatus;
  docs: WorkflowDocumentationResponse | null;
  error: string | null;
}

export interface DocumentationActions {
  fetch: (workflowId: string) => Promise<void>;
  regenerate: (workflowId: string) => Promise<void>;
  reset: () => void;
}

export type DocumentationStore = DocumentationState & DocumentationActions;

const initialState: DocumentationState = {
  status: 'idle',
  docs: null,
  error: null,
};

const toMessage = (err: unknown, fallback: string): string => {
  if (err instanceof AxiosError && err.response) {
    const data = err.response.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (err.response.status === 503) return 'AI service temporarily unavailable';
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
};

export const useDocumentationStore = create<DocumentationStore>((set) => ({
  ...initialState,

  fetch: async (workflowId) => {
    set({ status: 'loading', error: null });
    try {
      const docs = await getWorkflowDocs(workflowId);
      if (docs) {
        set({ status: 'ready', docs, error: null });
      } else {
        set({ status: 'idle', docs: null, error: null });
      }
    } catch (err) {
      set({ status: 'error', docs: null, error: toMessage(err, 'Failed to load documentation') });
    }
  },

  regenerate: async (workflowId) => {
    set({ status: 'loading', error: null });
    try {
      const docs = await regenerateWorkflowDocs(workflowId);
      set({ status: 'ready', docs, error: null });
    } catch (err) {
      set({
        status: 'error',
        docs: null,
        error: toMessage(err, 'Failed to generate documentation'),
      });
    }
  },

  reset: () => set({ ...initialState }),
}));
