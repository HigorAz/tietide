import { create } from 'zustand';
import type { Folder } from '@tietide/shared';
import {
  listFolders as apiList,
  createFolder as apiCreate,
  updateFolder as apiUpdate,
  deleteFolder as apiDelete,
  type CreateFolderBody,
  type UpdateFolderBody,
  type DeleteFolderResult,
} from '@/api/folders';

export type FoldersStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FoldersState {
  folders: Folder[];
  status: FoldersStatus;
  error: string | null;
}

export interface FoldersActions {
  fetch: () => Promise<void>;
  create: (body: CreateFolderBody) => Promise<Folder>;
  update: (id: string, body: UpdateFolderBody) => Promise<Folder>;
  remove: (id: string) => Promise<DeleteFolderResult>;
}

export type FoldersStore = FoldersState & FoldersActions;

const toMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong';
};

export const useFoldersStore = create<FoldersStore>((set, get) => ({
  folders: [],
  status: 'idle',
  error: null,

  fetch: async () => {
    set({ status: 'loading', error: null });
    try {
      const folders = await apiList();
      set({ folders, status: 'ready', error: null });
    } catch (err) {
      set({ status: 'error', error: toMessage(err) });
    }
  },

  create: async (body) => {
    const created = await apiCreate(body);
    set({ folders: [...get().folders, created] });
    return created;
  },

  update: async (id, body) => {
    const updated = await apiUpdate(id, body);
    set({
      folders: get().folders.map((f) => (f.id === id ? updated : f)),
    });
    return updated;
  },

  remove: async (id) => {
    const result = await apiDelete(id);
    // Cascade: drop the deleted folder + all descendants from the local cache
    const removed = new Set<string>([id]);
    let added = true;
    while (added) {
      added = false;
      for (const f of get().folders) {
        if (!removed.has(f.id) && f.parentFolderId !== null && removed.has(f.parentFolderId)) {
          removed.add(f.id);
          added = true;
        }
      }
    }
    set({ folders: get().folders.filter((f) => !removed.has(f.id)) });
    return result;
  },
}));
