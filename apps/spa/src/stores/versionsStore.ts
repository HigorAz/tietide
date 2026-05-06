import { create } from 'zustand';
import {
  getWorkflowVersion as apiGet,
  listWorkflowVersions as apiList,
  restoreWorkflowVersion as apiRestore,
  type WorkflowVersion,
  type WorkflowVersionRestoreResponse,
  type WorkflowVersionSummary,
} from '@/api/workflowVersions';

export type VersionsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface VersionsState {
  workflowId: string | null;
  list: WorkflowVersionSummary[];
  listStatus: VersionsStatus;
  listError: string | null;
  listNextCursor: string | null;
  cache: Record<number, WorkflowVersion>;
}

export interface VersionsActions {
  fetchInitial: (workflowId: string) => Promise<void>;
  loadMore: () => Promise<void>;
  getVersion: (workflowId: string, version: number) => Promise<WorkflowVersion>;
  restore: (workflowId: string, version: number) => Promise<WorkflowVersionRestoreResponse>;
  reset: () => void;
}

export type VersionsStore = VersionsState & VersionsActions;

const toMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong';
};

const initialState: VersionsState = {
  workflowId: null,
  list: [],
  listStatus: 'idle',
  listError: null,
  listNextCursor: null,
  cache: {},
};

export const useVersionsStore = create<VersionsStore>((set, get) => ({
  ...initialState,

  fetchInitial: async (workflowId) => {
    set({
      workflowId,
      list: [],
      listStatus: 'loading',
      listError: null,
      listNextCursor: null,
      cache: {},
    });
    try {
      const response = await apiList(workflowId);
      set({
        list: response.items,
        listNextCursor: response.nextCursor ?? null,
        listStatus: 'ready',
        listError: null,
      });
    } catch (err) {
      set({ listStatus: 'error', listError: toMessage(err) });
    }
  },

  loadMore: async () => {
    const { workflowId, listNextCursor } = get();
    if (!workflowId || !listNextCursor) return;
    set({ listStatus: 'loading', listError: null });
    try {
      const response = await apiList(workflowId, { cursor: listNextCursor });
      set((state) => ({
        list: [...state.list, ...response.items],
        listNextCursor: response.nextCursor ?? null,
        listStatus: 'ready',
      }));
    } catch (err) {
      set({ listStatus: 'error', listError: toMessage(err) });
    }
  },

  getVersion: async (workflowId, version) => {
    const cached = get().cache[version];
    if (cached) return cached;
    const fetched = await apiGet(workflowId, version);
    set((state) => ({ cache: { ...state.cache, [version]: fetched } }));
    return fetched;
  },

  restore: async (workflowId, version) => {
    return apiRestore(workflowId, version);
  },

  reset: () => set({ ...initialState, cache: {} }),
}));
