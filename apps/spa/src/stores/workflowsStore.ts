import { create } from 'zustand';
import type { Workflow } from '@tietide/shared';
import {
  listWorkflows as apiList,
  createWorkflow as apiCreate,
  deleteWorkflow as apiDelete,
  toggleWorkflowActive as apiToggle,
  type CreateWorkflowBody,
} from '@/api/workflows';

export type WorkflowsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface WorkflowsState {
  workflows: Workflow[];
  status: WorkflowsStatus;
  error: string | null;
}

export interface WorkflowsActions {
  fetch: () => Promise<void>;
  create: (body: CreateWorkflowBody) => Promise<Workflow>;
  remove: (id: string) => Promise<void>;
  toggleActive: (id: string, next: boolean) => Promise<void>;
}

export type WorkflowsStore = WorkflowsState & WorkflowsActions;

const toMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong';
};

export const useWorkflowsStore = create<WorkflowsStore>((set, get) => ({
  workflows: [],
  status: 'idle',
  error: null,

  fetch: async () => {
    set({ status: 'loading', error: null });
    try {
      const workflows = await apiList();
      set({ workflows, status: 'ready', error: null });
    } catch (err) {
      set({ status: 'error', error: toMessage(err) });
    }
  },

  create: async (body) => {
    const created = await apiCreate(body);
    set({ workflows: [created, ...get().workflows] });
    return created;
  },

  remove: async (id) => {
    await apiDelete(id);
    set({ workflows: get().workflows.filter((w) => w.id !== id) });
  },

  toggleActive: async (id, next) => {
    const existing = get().workflows.find((w) => w.id === id);
    if (!existing) return;

    const previous = existing.isActive;
    set({
      workflows: get().workflows.map((w) => (w.id === id ? { ...w, isActive: next } : w)),
    });

    try {
      const updated = await apiToggle(id, next);
      set({
        workflows: get().workflows.map((w) => (w.id === id ? updated : w)),
      });
    } catch (err) {
      set({
        workflows: get().workflows.map((w) => (w.id === id ? { ...w, isActive: previous } : w)),
      });
      throw err;
    }
  },
}));
