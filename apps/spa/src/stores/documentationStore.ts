import { create } from 'zustand';
import { AxiosError } from 'axios';
import {
  getWorkflowDocs,
  startWorkflowDocsRegeneration,
  type WorkflowDocumentationResponse,
} from '@/api/ai';

export type DocumentationStatus = 'idle' | 'loading' | 'ready' | 'error';

// Generation runs in the background and is polled. ~3.5 min of polling comfortably
// covers the ~120s a CPU-only model takes, with headroom, before we give up.
export const DOC_POLL_INTERVAL_MS = 3000;
export const DOC_POLL_MAX_ATTEMPTS = 70;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Monotonic token so a reset() or a newer regenerate() cancels any in-flight poll
// loop (Zustand has no per-call lifecycle to hang a timer ref on).
let activePoll = 0;

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

export const useDocumentationStore = create<DocumentationStore>((set, get) => ({
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
    // Readiness is detected by the doc's generatedAt advancing past this baseline
    // (or any doc appearing when there was none).
    const baseline = get().docs?.generatedAt ?? null;
    set({ status: 'loading', error: null });
    const token = ++activePoll;

    try {
      await startWorkflowDocsRegeneration(workflowId);
    } catch (err) {
      if (token !== activePoll) return;
      set({
        status: 'error',
        docs: null,
        error: toMessage(err, 'Failed to start documentation generation'),
      });
      return;
    }

    // Poll until a fresh doc appears. The first check is immediate; subsequent
    // checks wait DOC_POLL_INTERVAL_MS. Transient GET failures are tolerated.
    for (let attempt = 0; attempt < DOC_POLL_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await wait(DOC_POLL_INTERVAL_MS);
      if (token !== activePoll) return;

      let doc: WorkflowDocumentationResponse | null = null;
      try {
        doc = await getWorkflowDocs(workflowId);
      } catch {
        continue;
      }
      if (token !== activePoll) return;

      if (doc && (baseline === null || doc.generatedAt > baseline)) {
        set({ status: 'ready', docs: doc, error: null });
        return;
      }
    }

    if (token !== activePoll) return;
    set({
      status: 'error',
      error: 'Documentation is taking longer than expected. Please try again.',
    });
  },

  // Bump the token so any in-flight poll loop sees it's been superseded and stops.
  reset: () => {
    activePoll += 1;
    set({ ...initialState });
  },
}));
