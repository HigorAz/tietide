import { create } from 'zustand';
import type { Tag } from '@tietide/shared';
import {
  listTags as apiList,
  createTag as apiCreate,
  updateTag as apiUpdate,
  deleteTag as apiDelete,
  type CreateTagBody,
  type UpdateTagBody,
} from '@/api/tags';

export type TagsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TagsState {
  tags: Tag[];
  status: TagsStatus;
  error: string | null;
}

export interface TagsActions {
  fetch: () => Promise<void>;
  create: (body: CreateTagBody) => Promise<Tag>;
  update: (id: string, body: UpdateTagBody) => Promise<Tag>;
  remove: (id: string) => Promise<void>;
}

export type TagsStore = TagsState & TagsActions;

const toMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong';
};

export const useTagsStore = create<TagsStore>((set, get) => ({
  tags: [],
  status: 'idle',
  error: null,

  fetch: async () => {
    set({ status: 'loading', error: null });
    try {
      const tags = await apiList();
      set({ tags, status: 'ready', error: null });
    } catch (err) {
      set({ status: 'error', error: toMessage(err) });
    }
  },

  create: async (body) => {
    const created = await apiCreate(body);
    set({ tags: [...get().tags, created].sort((a, b) => a.name.localeCompare(b.name)) });
    return created;
  },

  update: async (id, body) => {
    const updated = await apiUpdate(id, body);
    set({
      tags: get()
        .tags.map((t) => (t.id === id ? updated : t))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
    return updated;
  },

  remove: async (id) => {
    await apiDelete(id);
    set({ tags: get().tags.filter((t) => t.id !== id) });
  },
}));
