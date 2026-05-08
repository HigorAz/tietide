import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Workflow } from '@tietide/shared';

vi.mock('@/api/workflows', () => ({
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  toggleWorkflowActive: vi.fn(),
  updateWorkflow: vi.fn(),
}));

import * as workflowsApi from '@/api/workflows';
import { useWorkflowsStore } from './workflowsStore';

const mockedList = vi.mocked(workflowsApi.listWorkflows);
const mockedCreate = vi.mocked(workflowsApi.createWorkflow);
const mockedDelete = vi.mocked(workflowsApi.deleteWorkflow);
const mockedToggle = vi.mocked(workflowsApi.toggleWorkflowActive);
const mockedUpdate = vi.mocked(workflowsApi.updateWorkflow);

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-1',
  name: 'Example',
  description: null,
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  userId: 'user-1',
  folderId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  executionCount: 0,
  documentation: null,
  tags: [],
  ...overrides,
});

const resetStore = (): void => {
  useWorkflowsStore.setState({
    workflows: [],
    status: 'idle',
    error: null,
    selectedFolderId: undefined,
    selectedTagIds: [],
  });
};

describe('workflowsStore', () => {
  beforeEach(() => {
    resetStore();
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedDelete.mockReset();
    mockedToggle.mockReset();
    mockedUpdate.mockReset();
  });

  describe('fetch', () => {
    it('should populate workflows and set status to ready on success', async () => {
      const rows = [makeWorkflow({ id: 'a' }), makeWorkflow({ id: 'b' })];
      mockedList.mockResolvedValueOnce(rows);

      await useWorkflowsStore.getState().fetch();

      expect(mockedList).toHaveBeenCalledTimes(1);
      expect(useWorkflowsStore.getState().workflows).toEqual(rows);
      expect(useWorkflowsStore.getState().status).toBe('ready');
      expect(useWorkflowsStore.getState().error).toBeNull();
    });

    it('should set status to error and capture an error message on failure', async () => {
      mockedList.mockRejectedValueOnce(new Error('network down'));

      await useWorkflowsStore.getState().fetch();

      expect(useWorkflowsStore.getState().status).toBe('error');
      expect(useWorkflowsStore.getState().error).toBe('network down');
      expect(useWorkflowsStore.getState().workflows).toEqual([]);
    });

    it('should move status to loading while the request is in flight', async () => {
      let resolve!: (rows: Workflow[]) => void;
      mockedList.mockReturnValueOnce(
        new Promise<Workflow[]>((r) => {
          resolve = r;
        }),
      );

      const pending = useWorkflowsStore.getState().fetch();
      expect(useWorkflowsStore.getState().status).toBe('loading');

      resolve([]);
      await pending;
      expect(useWorkflowsStore.getState().status).toBe('ready');
    });
  });

  describe('create', () => {
    it('should prepend the new workflow to the list and return it', async () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'existing' })],
        status: 'ready',
      });
      const created = makeWorkflow({ id: 'new' });
      mockedCreate.mockResolvedValueOnce(created);

      const result = await useWorkflowsStore
        .getState()
        .create({ name: 'New', definition: { nodes: [], edges: [] } });

      expect(mockedCreate).toHaveBeenCalledWith({
        name: 'New',
        definition: { nodes: [], edges: [] },
      });
      expect(result).toEqual(created);
      expect(useWorkflowsStore.getState().workflows.map((w) => w.id)).toEqual(['new', 'existing']);
    });

    it('should propagate errors without mutating the list', async () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'existing' })],
        status: 'ready',
      });
      mockedCreate.mockRejectedValueOnce(new Error('bad input'));

      await expect(
        useWorkflowsStore.getState().create({ name: '', definition: { nodes: [], edges: [] } }),
      ).rejects.toThrow('bad input');

      expect(useWorkflowsStore.getState().workflows.map((w) => w.id)).toEqual(['existing']);
    });
  });

  describe('remove', () => {
    it('should remove the workflow from the list on success', async () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'a' }), makeWorkflow({ id: 'b' })],
        status: 'ready',
      });
      mockedDelete.mockResolvedValueOnce();

      await useWorkflowsStore.getState().remove('a');

      expect(mockedDelete).toHaveBeenCalledWith('a');
      expect(useWorkflowsStore.getState().workflows.map((w) => w.id)).toEqual(['b']);
    });

    it('should keep the workflow in the list when the API call fails', async () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'a' })],
        status: 'ready',
      });
      mockedDelete.mockRejectedValueOnce(new Error('server error'));

      await expect(useWorkflowsStore.getState().remove('a')).rejects.toThrow('server error');

      expect(useWorkflowsStore.getState().workflows.map((w) => w.id)).toEqual(['a']);
    });
  });

  describe('toggleActive', () => {
    it('should flip isActive optimistically and replace the row with the server response', async () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'a', isActive: false })],
        status: 'ready',
      });
      const updated = makeWorkflow({ id: 'a', isActive: true, version: 2 });
      mockedToggle.mockResolvedValueOnce(updated);

      await useWorkflowsStore.getState().toggleActive('a', true);

      expect(mockedToggle).toHaveBeenCalledWith('a', true);
      const row = useWorkflowsStore.getState().workflows.find((w) => w.id === 'a');
      expect(row?.isActive).toBe(true);
      expect(row?.version).toBe(2);
    });

    it('should revert the optimistic flip when the request fails', async () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'a', isActive: false })],
        status: 'ready',
      });
      mockedToggle.mockRejectedValueOnce(new Error('forbidden'));

      await expect(useWorkflowsStore.getState().toggleActive('a', true)).rejects.toThrow(
        'forbidden',
      );

      const row = useWorkflowsStore.getState().workflows.find((w) => w.id === 'a');
      expect(row?.isActive).toBe(false);
    });

    it('should do nothing when the id is not in the list', async () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'a' })],
        status: 'ready',
      });

      await useWorkflowsStore.getState().toggleActive('missing', true);

      expect(mockedToggle).not.toHaveBeenCalled();
    });
  });

  describe('fetch with filters', () => {
    it('passes selectedFolderId/selectedTagIds when no params provided', async () => {
      useWorkflowsStore.setState({
        selectedFolderId: 'folder-uuid',
        selectedTagIds: ['tag-a'],
      });
      mockedList.mockResolvedValueOnce([]);

      await useWorkflowsStore.getState().fetch();

      expect(mockedList).toHaveBeenCalledWith({
        folderId: 'folder-uuid',
        tagIds: ['tag-a'],
      });
    });

    it('uses explicit params when provided, ignoring stored selections', async () => {
      useWorkflowsStore.setState({
        selectedFolderId: 'folder-uuid',
        selectedTagIds: ['tag-a'],
      });
      mockedList.mockResolvedValueOnce([]);

      await useWorkflowsStore.getState().fetch({ folderId: null });

      expect(mockedList).toHaveBeenCalledWith({ folderId: null });
    });

    it('updates selectedFolderId via setSelectedFolderId', () => {
      useWorkflowsStore.getState().setSelectedFolderId('folder-x');
      expect(useWorkflowsStore.getState().selectedFolderId).toBe('folder-x');
      useWorkflowsStore.getState().setSelectedFolderId(null);
      expect(useWorkflowsStore.getState().selectedFolderId).toBeNull();
    });

    it('updates selectedTagIds via setSelectedTagIds', () => {
      useWorkflowsStore.getState().setSelectedTagIds(['t1', 't2']);
      expect(useWorkflowsStore.getState().selectedTagIds).toEqual(['t1', 't2']);
    });
  });

  describe('moveToFolder', () => {
    it('optimistically updates folderId and replaces with server response', async () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'a', folderId: null })],
        status: 'ready',
      });
      const updated = makeWorkflow({ id: 'a', folderId: 'folder-1', version: 2 });
      mockedUpdate.mockResolvedValueOnce(updated);

      await useWorkflowsStore.getState().moveToFolder('a', 'folder-1');

      expect(mockedUpdate).toHaveBeenCalledWith('a', { folderId: 'folder-1' });
      const row = useWorkflowsStore.getState().workflows.find((w) => w.id === 'a');
      expect(row?.folderId).toBe('folder-1');
      expect(row?.version).toBe(2);
    });

    it('reverts the optimistic move when the API rejects', async () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'a', folderId: 'folder-1' })],
        status: 'ready',
      });
      mockedUpdate.mockRejectedValueOnce(new Error('forbidden'));

      await expect(useWorkflowsStore.getState().moveToFolder('a', 'folder-2')).rejects.toThrow(
        'forbidden',
      );

      const row = useWorkflowsStore.getState().workflows.find((w) => w.id === 'a');
      expect(row?.folderId).toBe('folder-1');
    });

    it('moves a workflow to root when folderId is null', async () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'a', folderId: 'folder-1' })],
        status: 'ready',
      });
      mockedUpdate.mockResolvedValueOnce(makeWorkflow({ id: 'a', folderId: null }));

      await useWorkflowsStore.getState().moveToFolder('a', null);

      expect(mockedUpdate).toHaveBeenCalledWith('a', { folderId: null });
    });
  });

  describe('setTags', () => {
    it('replaces a workflow row with the server response after tag update', async () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'a' })],
        status: 'ready',
      });
      const updated = makeWorkflow({
        id: 'a',
        tags: [{ id: 't1', name: 'foo', color: null }],
      });
      mockedUpdate.mockResolvedValueOnce(updated);

      await useWorkflowsStore.getState().setTags('a', ['t1']);

      expect(mockedUpdate).toHaveBeenCalledWith('a', { tagIds: ['t1'] });
      const row = useWorkflowsStore.getState().workflows.find((w) => w.id === 'a');
      expect(row?.tags).toEqual([{ id: 't1', name: 'foo', color: null }]);
    });
  });
});
