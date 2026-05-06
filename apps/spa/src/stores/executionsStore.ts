import { create } from 'zustand';
import type { ExecutionStep, WorkflowExecution } from '@tietide/shared';
import {
  listExecutions as apiList,
  listAllExecutions as apiListAll,
  getExecution as apiGet,
  listExecutionSteps as apiSteps,
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

  detail: WorkflowExecution | null;
  detailStatus: ExecutionsStatus;
  detailError: string | null;

  steps: ExecutionStep[];
  stepsStatus: ExecutionsStatus;
  stepsError: string | null;
}

export interface ExecutionsActions {
  fetchList: (params: FetchListParams) => Promise<void>;
  fetchAll: (filters: ExecutionFilters) => Promise<void>;
  loadMore: () => Promise<void>;
  setFilters: (next: Partial<ExecutionFilters>) => void;
  fetchDetail: (executionId: string) => Promise<void>;
  fetchSteps: (executionId: string) => Promise<void>;
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
  detail: null,
  detailStatus: 'idle',
  detailError: null,
  steps: [],
  stepsStatus: 'idle',
  stepsError: null,
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

  fetchDetail: async (executionId) => {
    set({ detailStatus: 'loading', detailError: null });
    try {
      const detail = await apiGet(executionId);
      set({ detail, detailStatus: 'ready', detailError: null });
    } catch (err) {
      set({ detailStatus: 'error', detailError: toMessage(err) });
    }
  },

  fetchSteps: async (executionId) => {
    set({ stepsStatus: 'loading', stepsError: null });
    try {
      const steps = await apiSteps(executionId);
      set({ steps, stepsStatus: 'ready', stepsError: null });
    } catch (err) {
      set({ stepsStatus: 'error', stepsError: toMessage(err) });
    }
  },
}));
