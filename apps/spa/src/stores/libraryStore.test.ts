import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Workflow } from '@tietide/shared';
import type { WorkflowTemplate } from '@/api/library';

vi.mock('@/api/library', () => ({
  listTemplates: vi.fn(),
  instantiateTemplate: vi.fn(),
}));

import * as libraryApi from '@/api/library';
import { useLibraryStore } from './libraryStore';

const mockedList = vi.mocked(libraryApi.listTemplates);
const mockedInstantiate = vi.mocked(libraryApi.instantiateTemplate);

const makeTemplate = (overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate => ({
  slug: 'cron-fetch-process',
  name: 'Demo: Cron → Fetch → Archive',
  description: 'Cron fixture',
  category: 'Schedule',
  nodeTypes: ['cron-trigger', 'http-request'],
  ...overrides,
});

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-new',
  name: 'Demo: Cron → Fetch → Archive',
  description: 'Cron fixture',
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-05-04T10:00:00Z'),
  updatedAt: new Date('2026-05-04T10:00:00Z'),
  executionCount: 0,
  documentation: null,
  ...overrides,
});

const resetStore = (): void => {
  useLibraryStore.setState({
    templates: [],
    status: 'idle',
    error: null,
    search: '',
    category: null,
  });
};

describe('libraryStore', () => {
  beforeEach(() => {
    resetStore();
    mockedList.mockReset();
    mockedInstantiate.mockReset();
  });

  describe('fetch', () => {
    it('should populate templates and set status to ready on success', async () => {
      const rows = [makeTemplate({ slug: 'a' }), makeTemplate({ slug: 'b' })];
      mockedList.mockResolvedValueOnce(rows);

      await useLibraryStore.getState().fetch();

      expect(mockedList).toHaveBeenCalledTimes(1);
      expect(useLibraryStore.getState().templates).toEqual(rows);
      expect(useLibraryStore.getState().status).toBe('ready');
      expect(useLibraryStore.getState().error).toBeNull();
    });

    it('should set status to error and capture an error message on failure', async () => {
      mockedList.mockRejectedValueOnce(new Error('network down'));

      await useLibraryStore.getState().fetch();

      expect(useLibraryStore.getState().status).toBe('error');
      expect(useLibraryStore.getState().error).toBe('network down');
      expect(useLibraryStore.getState().templates).toEqual([]);
    });

    it('should move status to loading while the request is in flight', async () => {
      let resolve!: (rows: WorkflowTemplate[]) => void;
      mockedList.mockReturnValueOnce(
        new Promise<WorkflowTemplate[]>((r) => {
          resolve = r;
        }),
      );

      const pending = useLibraryStore.getState().fetch();
      expect(useLibraryStore.getState().status).toBe('loading');

      resolve([]);
      await pending;
      expect(useLibraryStore.getState().status).toBe('ready');
    });
  });

  describe('setSearch', () => {
    it('should update the search field', () => {
      useLibraryStore.getState().setSearch('webhook');
      expect(useLibraryStore.getState().search).toBe('webhook');
    });
  });

  describe('setCategory', () => {
    it('should update the category filter', () => {
      useLibraryStore.getState().setCategory('Webhook');
      expect(useLibraryStore.getState().category).toBe('Webhook');
    });

    it('should accept null to clear the filter', () => {
      useLibraryStore.setState({ category: 'Webhook' });
      useLibraryStore.getState().setCategory(null);
      expect(useLibraryStore.getState().category).toBeNull();
    });
  });

  describe('instantiate', () => {
    it('should call the API with the slug and return the new workflow', async () => {
      const created = makeWorkflow({ id: 'new-id' });
      mockedInstantiate.mockResolvedValueOnce(created);

      const result = await useLibraryStore.getState().instantiate('cron-fetch-process');

      expect(mockedInstantiate).toHaveBeenCalledWith('cron-fetch-process');
      expect(result).toEqual(created);
    });

    it('should propagate API errors so the page can show feedback', async () => {
      mockedInstantiate.mockRejectedValueOnce(new Error('not found'));

      await expect(useLibraryStore.getState().instantiate('no-such')).rejects.toThrow('not found');
    });
  });
});
