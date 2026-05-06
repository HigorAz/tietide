import { create } from 'zustand';
import type { WorkflowExecution } from '@tietide/shared';
import {
  listExecutions as apiList,
  listAllExecutions as apiListAll,
  type ExecutionFilters,
} from '@/api/executions';

export type ExecutionsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FetchListParams extends ExecutionFilters {
  workflowId?: string;
}

export interface ExecutionsState {
  list: WorkflowExecution[];
  listTotal: number;
  listStatus: ExecutionsStatus;
  listError: string | null;
  listNextCursor: string | null;

  filters: ExecutionFilters;
}

export interface ExecutionsActions {
  fetchList: (params: FetchListParams) => Promise<void>;
  fetchAll: (filters: ExecutionFilters) => Promise<void>;
  loadMore: () => Promise<void>;
  setFilters: (next: Partial<ExecutionFilters>) => void;
}

export type ExecutionsStore = ExecutionsState & ExecutionsActions;

const toMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong';
};

const initialState: ExecutionsState = {
  list: [],
  listTotal: 0,
  listStatus: 'idle',
  listError: null,
  listNextCursor: null,
  filters: {},
};

export const useExecutionsStore = create<ExecutionsStore>((set, get) => ({
  ...initialState,

  fetchList: async (params) => {
    set({ listStatus: 'loading', listError: null });
    try {
      const { workflowId, ...callFilters } = params;
      const response = workflowId
        ? await apiList(workflowId, { ...get().filters, ...callFilters })
        : await apiListAll(callFilters);
      set({
        list: response.items,
        listTotal: response.total,
        listStatus: 'ready',
        listError: null,
        listNextCursor: response.nextCursor ?? null,
      });
    } catch (err) {
      set({ listStatus: 'error', listError: toMessage(err) });
    }
  },

  fetchAll: async (filters) => {
    set({ listStatus: 'loading', listError: null });
    try {
      const response = await apiListAll(filters);
      set({
        list: response.items,
        listTotal: response.total,
        listStatus: 'ready',
        listError: null,
        listNextCursor: response.nextCursor ?? null,
      });
    } catch (err) {
      set({ listStatus: 'error', listError: toMessage(err) });
    }
  },

  loadMore: async () => {
    const { listNextCursor, filters } = get();
    if (!listNextCursor) return;
    set({ listStatus: 'loading', listError: null });
    try {
      const response = await apiListAll({ ...filters, cursor: listNextCursor });
      set((state) => ({
        list: [...state.list, ...response.items],
        listTotal: response.total,
        listStatus: 'ready',
        listError: null,
        listNextCursor: response.nextCursor ?? null,
      }));
    } catch (err) {
      set({ listStatus: 'error', listError: toMessage(err) });
    }
  },

  setFilters: (next) => {
    const merged = { ...get().filters, ...next };
    for (const key of Object.keys(next) as (keyof ExecutionFilters)[]) {
      if (next[key] === undefined) delete merged[key];
    }
    set({ filters: merged });
  },
}));
