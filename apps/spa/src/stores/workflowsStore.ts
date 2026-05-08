import { create } from 'zustand';
import type { Workflow, WorkflowDocumentationMeta } from '@tietide/shared';
import {
  listWorkflows as apiList,
  createWorkflow as apiCreate,
  deleteWorkflow as apiDelete,
  toggleWorkflowActive as apiToggle,
  updateWorkflow as apiUpdate,
  type CreateWorkflowBody,
  type ListWorkflowsParams,
} from '@/api/workflows';

export type WorkflowsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** undefined = "no filter", null = "root only", string = folder UUID. */
export type FolderFilter = string | null | undefined;

export interface WorkflowsState {
  workflows: Workflow[];
  status: WorkflowsStatus;
  error: string | null;
  selectedFolderId: FolderFilter;
  selectedTagIds: string[];
}

export interface WorkflowsActions {
  fetch: (params?: ListWorkflowsParams) => Promise<void>;
  create: (body: CreateWorkflowBody) => Promise<Workflow>;
  remove: (id: string) => Promise<void>;
  toggleActive: (id: string, next: boolean) => Promise<void>;
  moveToFolder: (id: string, folderId: string | null) => Promise<void>;
  setTags: (id: string, tagIds: string[]) => Promise<void>;
  setSelectedFolderId: (folderId: FolderFilter) => void;
  setSelectedTagIds: (tagIds: string[]) => void;
  setDocumentationMeta: (id: string, meta: WorkflowDocumentationMeta) => void;
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
  selectedFolderId: undefined,
  selectedTagIds: [],

  fetch: async (params) => {
    set({ status: 'loading', error: null });
    try {
      const effective: ListWorkflowsParams = params ?? {
        folderId: get().selectedFolderId,
        tagIds: get().selectedTagIds,
      };
      const workflows = await apiList(effective);
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

  moveToFolder: async (id, folderId) => {
    const existing = get().workflows.find((w) => w.id === id);
    if (!existing) return;

    const previousFolderId = existing.folderId;
    // Optimistic update
    set({
      workflows: get().workflows.map((w) => (w.id === id ? { ...w, folderId } : w)),
    });

    try {
      const updated = await apiUpdate(id, { folderId });
      set({
        workflows: get().workflows.map((w) => (w.id === id ? updated : w)),
      });
    } catch (err) {
      set({
        workflows: get().workflows.map((w) =>
          w.id === id ? { ...w, folderId: previousFolderId } : w,
        ),
      });
      throw err;
    }
  },

  setTags: async (id, tagIds) => {
    const updated = await apiUpdate(id, { tagIds });
    set({
      workflows: get().workflows.map((w) => (w.id === id ? updated : w)),
    });
  },

  setSelectedFolderId: (folderId) => {
    set({ selectedFolderId: folderId });
  },

  setSelectedTagIds: (tagIds) => {
    set({ selectedTagIds: tagIds });
  },

  setDocumentationMeta: (id, meta) => {
    set({
      workflows: get().workflows.map((w) => (w.id === id ? { ...w, documentation: meta } : w)),
    });
  },
}));
