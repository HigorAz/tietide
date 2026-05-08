import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Folder } from '@tietide/shared';

vi.mock('@/api/folders', () => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

import * as foldersApi from '@/api/folders';
import { useFoldersStore } from './foldersStore';

const mockedList = vi.mocked(foldersApi.listFolders);
const mockedCreate = vi.mocked(foldersApi.createFolder);
const mockedUpdate = vi.mocked(foldersApi.updateFolder);
const mockedDelete = vi.mocked(foldersApi.deleteFolder);

const makeFolder = (overrides: Partial<Folder> = {}): Folder => ({
  id: 'f-1',
  name: 'Folder',
  parentFolderId: null,
  createdAt: new Date('2026-05-08T00:00:00Z'),
  ...overrides,
});

const resetStore = (): void => {
  useFoldersStore.setState({ folders: [], status: 'idle', error: null });
};

describe('foldersStore', () => {
  beforeEach(() => {
    resetStore();
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
    mockedDelete.mockReset();
  });

  describe('fetch', () => {
    it('loads folders into state on success', async () => {
      const folders = [makeFolder({ id: 'a' }), makeFolder({ id: 'b' })];
      mockedList.mockResolvedValueOnce(folders);

      await useFoldersStore.getState().fetch();

      expect(useFoldersStore.getState().folders).toEqual(folders);
      expect(useFoldersStore.getState().status).toBe('ready');
    });

    it('captures error message on failure', async () => {
      mockedList.mockRejectedValueOnce(new Error('boom'));

      await useFoldersStore.getState().fetch();

      expect(useFoldersStore.getState().status).toBe('error');
      expect(useFoldersStore.getState().error).toBe('boom');
    });
  });

  describe('create', () => {
    it('appends the created folder to state', async () => {
      const created = makeFolder({ id: 'new', name: 'Created' });
      mockedCreate.mockResolvedValueOnce(created);

      await useFoldersStore.getState().create({ name: 'Created' });

      expect(useFoldersStore.getState().folders).toContainEqual(created);
    });
  });

  describe('update', () => {
    it('replaces the matching folder in state', async () => {
      useFoldersStore.setState({ folders: [makeFolder({ id: 'a', name: 'Old' })] });
      const updated = makeFolder({ id: 'a', name: 'New' });
      mockedUpdate.mockResolvedValueOnce(updated);

      await useFoldersStore.getState().update('a', { name: 'New' });

      expect(useFoldersStore.getState().folders).toEqual([updated]);
    });
  });

  describe('remove', () => {
    it('returns the cascade counts from the API', async () => {
      mockedDelete.mockResolvedValueOnce({ deletedFolders: 2, deletedWorkflows: 5 });

      const result = await useFoldersStore.getState().remove('a');

      expect(result).toEqual({ deletedFolders: 2, deletedWorkflows: 5 });
    });

    it('removes the deleted folder and all descendants from state', async () => {
      useFoldersStore.setState({
        folders: [
          makeFolder({ id: 'root', parentFolderId: null }),
          makeFolder({ id: 'child', parentFolderId: 'root' }),
          makeFolder({ id: 'grandchild', parentFolderId: 'child' }),
          makeFolder({ id: 'sibling', parentFolderId: null }),
        ],
      });
      mockedDelete.mockResolvedValueOnce({ deletedFolders: 3, deletedWorkflows: 0 });

      await useFoldersStore.getState().remove('root');

      const remaining = useFoldersStore.getState().folders.map((f) => f.id);
      expect(remaining).toEqual(['sibling']);
    });
  });
});
