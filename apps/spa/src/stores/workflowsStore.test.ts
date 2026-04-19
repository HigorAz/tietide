import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Workflow } from '@tietide/shared';

vi.mock('@/api/workflows', () => ({
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  toggleWorkflowActive: vi.fn(),
}));

import * as workflowsApi from '@/api/workflows';
import { useWorkflowsStore } from './workflowsStore';

const mockedList = vi.mocked(workflowsApi.listWorkflows);
const mockedCreate = vi.mocked(workflowsApi.createWorkflow);
const mockedDelete = vi.mocked(workflowsApi.deleteWorkflow);
const mockedToggle = vi.mocked(workflowsApi.toggleWorkflowActive);

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-1',
  name: 'Example',
  description: null,
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  executionCount: 0,
  ...overrides,
});

const resetStore = (): void => {
  useWorkflowsStore.setState({
    workflows: [],
    status: 'idle',
    error: null,
  });
};

describe('workflowsStore', () => {
  beforeEach(() => {
    resetStore();
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedDelete.mockReset();
    mockedToggle.mockReset();
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

  describe('upsert', () => {
    it('should replace an existing workflow in the list by id', () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'a', version: 1 }), makeWorkflow({ id: 'b', version: 1 })],
        status: 'ready',
      });
      const next = makeWorkflow({ id: 'a', version: 2, name: 'Renamed' });

      useWorkflowsStore.getState().upsert(next);

      const rows = useWorkflowsStore.getState().workflows;
      expect(rows.find((w) => w.id === 'a')).toEqual(next);
      expect(rows.map((w) => w.id)).toEqual(['a', 'b']);
    });

    it('should prepend the workflow when no row with the same id exists', () => {
      useWorkflowsStore.setState({
        workflows: [makeWorkflow({ id: 'existing' })],
        status: 'ready',
      });
      const fresh = makeWorkflow({ id: 'new' });

      useWorkflowsStore.getState().upsert(fresh);

      expect(useWorkflowsStore.getState().workflows.map((w) => w.id)).toEqual(['new', 'existing']);
    });

    it('should not mutate the list for unrelated ids', () => {
      const rows = [makeWorkflow({ id: 'a' }), makeWorkflow({ id: 'b' })];
      useWorkflowsStore.setState({ workflows: rows, status: 'ready' });

      useWorkflowsStore.getState().upsert(makeWorkflow({ id: 'a', version: 9 }));

      expect(useWorkflowsStore.getState().workflows[1]).toEqual(rows[1]);
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
});
