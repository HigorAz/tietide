import { create } from 'zustand';
import type { Workflow } from '@tietide/shared';
import {
  listTemplates as apiListTemplates,
  instantiateTemplate as apiInstantiateTemplate,
  type WorkflowTemplate,
} from '@/api/library';

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LibraryState {
  templates: WorkflowTemplate[];
  status: LibraryStatus;
  error: string | null;
  search: string;
  category: string | null;
}

export interface LibraryActions {
  fetch: () => Promise<void>;
  setSearch: (search: string) => void;
  setCategory: (category: string | null) => void;
  instantiate: (slug: string) => Promise<Workflow>;
}

export type LibraryStore = LibraryState & LibraryActions;

const toMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong';
};

export const useLibraryStore = create<LibraryStore>((set) => ({
  templates: [],
  status: 'idle',
  error: null,
  search: '',
  category: null,

  fetch: async () => {
    set({ status: 'loading', error: null });
    try {
      const templates = await apiListTemplates();
      set({ templates, status: 'ready', error: null });
    } catch (err) {
      set({ status: 'error', error: toMessage(err) });
    }
  },

  setSearch: (search) => set({ search }),
  setCategory: (category) => set({ category }),

  instantiate: async (slug) => apiInstantiateTemplate(slug),
}));
