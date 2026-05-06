import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVersionsStore } from './versionsStore';
import * as api from '@/api/workflowVersions';

vi.mock('@/api/workflowVersions');

const workflowId = 'workflow-uuid-1';
const baseDefinition = {
  nodes: [
    { id: 'n1', type: 'manual-trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} },
  ],
  edges: [],
};

const summary = (version: number) => ({
  id: `v${version}`,
  version,
  message: null,
  createdAt: new Date(`2026-05-06T${10 + version}:00:00Z`).toISOString(),
  createdBy: { id: 'user-1', email: 'user@example.com' },
});

describe('versionsStore', () => {
  beforeEach(() => {
    useVersionsStore.getState().reset();
    vi.resetAllMocks();
  });

  describe('fetchInitial', () => {
    it('should populate list and nextCursor on success', async () => {
      vi.mocked(api.listWorkflowVersions).mockResolvedValue({
        items: [summary(3), summary(2), summary(1)],
        nextCursor: null,
      });

      await useVersionsStore.getState().fetchInitial(workflowId);

      const state = useVersionsStore.getState();
      expect(state.list).toHaveLength(3);
      expect(state.listStatus).toBe('ready');
      expect(state.listNextCursor).toBeNull();
      expect(state.workflowId).toBe(workflowId);
    });

    it('should record an error when the request fails', async () => {
      vi.mocked(api.listWorkflowVersions).mockRejectedValue(new Error('boom'));

      await useVersionsStore.getState().fetchInitial(workflowId);

      const state = useVersionsStore.getState();
      expect(state.listStatus).toBe('error');
      expect(state.listError).toBe('boom');
    });

    it('should reset list and cache when called for a different workflow', async () => {
      vi.mocked(api.listWorkflowVersions).mockResolvedValue({
        items: [summary(1)],
        nextCursor: null,
      });
      await useVersionsStore.getState().fetchInitial('workflow-A');
      expect(useVersionsStore.getState().list).toHaveLength(1);

      vi.mocked(api.listWorkflowVersions).mockResolvedValue({ items: [], nextCursor: null });
      await useVersionsStore.getState().fetchInitial('workflow-B');

      expect(useVersionsStore.getState().workflowId).toBe('workflow-B');
      expect(useVersionsStore.getState().list).toEqual([]);
      expect(useVersionsStore.getState().cache).toEqual({});
    });
  });

  describe('loadMore', () => {
    it('should append items and update nextCursor when called with a cursor', async () => {
      vi.mocked(api.listWorkflowVersions).mockResolvedValueOnce({
        items: [summary(3), summary(2)],
        nextCursor: 'cursor-1',
      });
      await useVersionsStore.getState().fetchInitial(workflowId);

      vi.mocked(api.listWorkflowVersions).mockResolvedValueOnce({
        items: [summary(1)],
        nextCursor: null,
      });
      await useVersionsStore.getState().loadMore();

      const state = useVersionsStore.getState();
      expect(state.list.map((s) => s.version)).toEqual([3, 2, 1]);
      expect(state.listNextCursor).toBeNull();
      expect(api.listWorkflowVersions).toHaveBeenLastCalledWith(workflowId, {
        cursor: 'cursor-1',
      });
    });

    it('should be a no-op when nextCursor is null', async () => {
      await useVersionsStore.getState().loadMore();
      expect(api.listWorkflowVersions).not.toHaveBeenCalled();
    });
  });

  describe('getVersion', () => {
    it('should fetch and cache the version on miss', async () => {
      const full = {
        id: 'v2',
        workflowId,
        version: 2,
        definition: baseDefinition,
        message: null,
        createdAt: new Date().toISOString(),
        createdBy: null,
      };
      vi.mocked(api.getWorkflowVersion).mockResolvedValue(full);

      const result = await useVersionsStore.getState().getVersion(workflowId, 2);

      expect(result).toEqual(full);
      expect(useVersionsStore.getState().cache[2]).toEqual(full);
    });

    it('should return cached version without re-fetching on hit', async () => {
      const full = {
        id: 'v2',
        workflowId,
        version: 2,
        definition: baseDefinition,
        message: null,
        createdAt: new Date().toISOString(),
        createdBy: null,
      };
      vi.mocked(api.getWorkflowVersion).mockResolvedValue(full);
      await useVersionsStore.getState().getVersion(workflowId, 2);

      vi.mocked(api.getWorkflowVersion).mockClear();
      await useVersionsStore.getState().getVersion(workflowId, 2);

      expect(api.getWorkflowVersion).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('should call the restore API and return its payload', async () => {
      vi.mocked(api.restoreWorkflowVersion).mockResolvedValue({
        version: 2,
        definition: baseDefinition,
      });

      const result = await useVersionsStore.getState().restore(workflowId, 2);

      expect(api.restoreWorkflowVersion).toHaveBeenCalledWith(workflowId, 2);
      expect(result.definition).toEqual(baseDefinition);
    });
  });
});
