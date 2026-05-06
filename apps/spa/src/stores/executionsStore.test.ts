import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowExecution } from '@tietide/shared';

vi.mock('@/api/executions', () => ({
  listExecutions: vi.fn(),
  listAllExecutions: vi.fn(),
}));

import * as executionsApi from '@/api/executions';
import { useExecutionsStore } from './executionsStore';

const mockedList = vi.mocked(executionsApi.listExecutions);
const mockedListAll = vi.mocked(executionsApi.listAllExecutions);

const makeExecution = (overrides: Partial<WorkflowExecution> = {}): WorkflowExecution => ({
  id: 'exec-1',
  workflowId: 'wf-1',
  status: 'SUCCESS',
  triggerType: 'manual',
  triggerData: null,
  startedAt: new Date('2026-04-20T10:00:00Z'),
  finishedAt: new Date('2026-04-20T10:00:05Z'),
  error: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
  ...overrides,
});

const resetStore = (): void => {
  useExecutionsStore.setState({
    list: [],
    listTotal: 0,
    listStatus: 'idle',
    listError: null,
    listNextCursor: null,
    filters: {},
  });
};

describe('executionsStore', () => {
  beforeEach(() => {
    resetStore();
    mockedList.mockReset();
    mockedListAll.mockReset();
  });

  describe('fetchList', () => {
    it('should call listExecutions(workflowId, filters) when workflowId is provided', async () => {
      const items = [makeExecution({ id: 'a' }), makeExecution({ id: 'b' })];
      mockedList.mockResolvedValueOnce({
        items,
        total: 2,
        page: 1,
        pageSize: 20,
        nextCursor: null,
      });

      await useExecutionsStore.getState().fetchList({ workflowId: 'wf-1' });

      expect(mockedList).toHaveBeenCalledWith('wf-1', {});
      expect(mockedListAll).not.toHaveBeenCalled();
      expect(useExecutionsStore.getState().list).toEqual(items);
      expect(useExecutionsStore.getState().listTotal).toBe(2);
      expect(useExecutionsStore.getState().listStatus).toBe('ready');
      expect(useExecutionsStore.getState().listError).toBeNull();
    });

    it('should call listAllExecutions(filters) when workflowId is omitted (cross-workflow)', async () => {
      const items = [makeExecution({ id: 'a' })];
      mockedListAll.mockResolvedValueOnce({
        items,
        total: 1,
        page: 1,
        pageSize: 5,
        nextCursor: null,
      });

      await useExecutionsStore.getState().fetchList({ pageSize: 5 });

      expect(mockedListAll).toHaveBeenCalledWith({ pageSize: 5 });
      expect(mockedList).not.toHaveBeenCalled();
      expect(useExecutionsStore.getState().list).toEqual(items);
      expect(useExecutionsStore.getState().listStatus).toBe('ready');
    });

    it('should merge stored filters with call-time params for the workflow-scoped path', async () => {
      useExecutionsStore.setState({ filters: { status: 'FAILED' } });
      mockedList.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        nextCursor: null,
      });

      await useExecutionsStore.getState().fetchList({ workflowId: 'wf-1' });

      expect(mockedList).toHaveBeenCalledWith('wf-1', { status: 'FAILED' });
    });

    it('should not bleed stored filters into the cross-workflow path', async () => {
      useExecutionsStore.setState({ filters: { status: 'FAILED' } });
      mockedListAll.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        pageSize: 5,
        nextCursor: null,
      });

      await useExecutionsStore.getState().fetchList({ pageSize: 5 });

      expect(mockedListAll).toHaveBeenCalledWith({ pageSize: 5 });
    });

    it('should set status to error and capture an error message on failure (workflow-scoped)', async () => {
      mockedList.mockRejectedValueOnce(new Error('network down'));

      await useExecutionsStore.getState().fetchList({ workflowId: 'wf-1' });

      expect(useExecutionsStore.getState().listStatus).toBe('error');
      expect(useExecutionsStore.getState().listError).toBe('network down');
    });

    it('should set status to error on cross-workflow failure', async () => {
      mockedListAll.mockRejectedValueOnce(new Error('boom'));

      await useExecutionsStore.getState().fetchList({ pageSize: 5 });

      expect(useExecutionsStore.getState().listStatus).toBe('error');
      expect(useExecutionsStore.getState().listError).toBe('boom');
    });

    it('should store nextCursor from the API response', async () => {
      mockedListAll.mockResolvedValueOnce({
        items: [makeExecution({ id: 'a' })],
        total: 50,
        page: 1,
        pageSize: 20,
        nextCursor: 'c1',
      });

      await useExecutionsStore.getState().fetchList({});

      expect(useExecutionsStore.getState().listNextCursor).toBe('c1');
    });

    it('should reset listNextCursor when fetchList is called fresh', async () => {
      useExecutionsStore.setState({ listNextCursor: 'stale' });
      mockedListAll.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        nextCursor: null,
      });

      await useExecutionsStore.getState().fetchList({});

      expect(useExecutionsStore.getState().listNextCursor).toBeNull();
    });
  });

  describe('loadMore', () => {
    it('should append rows and update nextCursor when one is set', async () => {
      useExecutionsStore.setState({
        list: [makeExecution({ id: 'a' })],
        listNextCursor: 'c1',
        filters: { status: 'SUCCESS' },
      });
      mockedListAll.mockResolvedValueOnce({
        items: [makeExecution({ id: 'b' }), makeExecution({ id: 'c' })],
        total: 50,
        page: 1,
        pageSize: 20,
        nextCursor: 'c2',
      });

      await useExecutionsStore.getState().loadMore();

      expect(mockedListAll).toHaveBeenCalledWith({ status: 'SUCCESS', cursor: 'c1' });
      expect(useExecutionsStore.getState().list.map((e) => e.id)).toEqual(['a', 'b', 'c']);
      expect(useExecutionsStore.getState().listNextCursor).toBe('c2');
    });

    it('should null out listNextCursor when the API returns no further cursor', async () => {
      useExecutionsStore.setState({
        list: [makeExecution({ id: 'a' })],
        listNextCursor: 'c1',
      });
      mockedListAll.mockResolvedValueOnce({
        items: [makeExecution({ id: 'b' })],
        total: 2,
        page: 1,
        pageSize: 20,
        nextCursor: null,
      });

      await useExecutionsStore.getState().loadMore();

      expect(useExecutionsStore.getState().listNextCursor).toBeNull();
    });

    it('should be a no-op when no nextCursor is set', async () => {
      useExecutionsStore.setState({ listNextCursor: null });

      await useExecutionsStore.getState().loadMore();

      expect(mockedListAll).not.toHaveBeenCalled();
    });
  });

  describe('setFilters', () => {
    it('should merge partial filters into existing state', () => {
      useExecutionsStore.setState({ filters: { status: 'SUCCESS' } });

      useExecutionsStore.getState().setFilters({ from: new Date('2026-04-01T00:00:00Z') });

      expect(useExecutionsStore.getState().filters).toEqual({
        status: 'SUCCESS',
        from: new Date('2026-04-01T00:00:00Z'),
      });
    });

    it('should remove a filter when the value is undefined', () => {
      useExecutionsStore.setState({
        filters: { status: 'SUCCESS', from: new Date('2026-04-01T00:00:00Z') },
      });

      useExecutionsStore.getState().setFilters({ status: undefined });

      expect(useExecutionsStore.getState().filters).toEqual({
        from: new Date('2026-04-01T00:00:00Z'),
      });
    });
  });
});
