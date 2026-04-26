import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionStep, WorkflowExecution } from '@tietide/shared';

vi.mock('@/api/executions', () => ({
  listExecutions: vi.fn(),
  getExecution: vi.fn(),
  listExecutionSteps: vi.fn(),
}));

import * as executionsApi from '@/api/executions';
import { useExecutionsStore } from './executionsStore';

const mockedList = vi.mocked(executionsApi.listExecutions);
const mockedGet = vi.mocked(executionsApi.getExecution);
const mockedSteps = vi.mocked(executionsApi.listExecutionSteps);

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

const makeStep = (overrides: Partial<ExecutionStep> = {}): ExecutionStep => ({
  id: 'step-1',
  executionId: 'exec-1',
  nodeId: 'trigger-1',
  nodeType: 'manual_trigger',
  nodeName: 'Start',
  status: 'SUCCESS',
  inputData: null,
  outputData: { ok: true },
  error: null,
  startedAt: new Date('2026-04-20T10:00:00Z'),
  finishedAt: new Date('2026-04-20T10:00:01Z'),
  durationMs: 1000,
  ...overrides,
});

const resetStore = (): void => {
  useExecutionsStore.setState({
    list: [],
    listTotal: 0,
    listStatus: 'idle',
    listError: null,
    filters: {},
    detail: null,
    detailStatus: 'idle',
    detailError: null,
    steps: [],
    stepsStatus: 'idle',
    stepsError: null,
  });
};

describe('executionsStore', () => {
  beforeEach(() => {
    resetStore();
    mockedList.mockReset();
    mockedGet.mockReset();
    mockedSteps.mockReset();
  });

  describe('fetchList', () => {
    it('should populate list and set status to ready on success', async () => {
      const items = [makeExecution({ id: 'a' }), makeExecution({ id: 'b' })];
      mockedList.mockResolvedValueOnce({ items, total: 2, page: 1, pageSize: 20 });

      await useExecutionsStore.getState().fetchList('wf-1');

      expect(mockedList).toHaveBeenCalledWith('wf-1', {});
      expect(useExecutionsStore.getState().list).toEqual(items);
      expect(useExecutionsStore.getState().listTotal).toBe(2);
      expect(useExecutionsStore.getState().listStatus).toBe('ready');
      expect(useExecutionsStore.getState().listError).toBeNull();
    });

    it('should pass current filters to the API call', async () => {
      const filters = { status: 'FAILED' as const };
      useExecutionsStore.setState({ filters });
      mockedList.mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 });

      await useExecutionsStore.getState().fetchList('wf-1');

      expect(mockedList).toHaveBeenCalledWith('wf-1', filters);
    });

    it('should set status to error and capture an error message on failure', async () => {
      mockedList.mockRejectedValueOnce(new Error('network down'));

      await useExecutionsStore.getState().fetchList('wf-1');

      expect(useExecutionsStore.getState().listStatus).toBe('error');
      expect(useExecutionsStore.getState().listError).toBe('network down');
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

  describe('fetchDetail', () => {
    it('should populate detail and set status to ready on success', async () => {
      const exec = makeExecution({ id: 'a' });
      mockedGet.mockResolvedValueOnce(exec);

      await useExecutionsStore.getState().fetchDetail('a');

      expect(mockedGet).toHaveBeenCalledWith('a');
      expect(useExecutionsStore.getState().detail).toEqual(exec);
      expect(useExecutionsStore.getState().detailStatus).toBe('ready');
    });

    it('should set status to error on failure', async () => {
      mockedGet.mockRejectedValueOnce(new Error('not found'));

      await useExecutionsStore.getState().fetchDetail('a');

      expect(useExecutionsStore.getState().detailStatus).toBe('error');
      expect(useExecutionsStore.getState().detailError).toBe('not found');
    });
  });

  describe('fetchSteps', () => {
    it('should populate steps and set status to ready on success', async () => {
      const steps = [makeStep({ id: 's1' }), makeStep({ id: 's2' })];
      mockedSteps.mockResolvedValueOnce(steps);

      await useExecutionsStore.getState().fetchSteps('exec-1');

      expect(mockedSteps).toHaveBeenCalledWith('exec-1');
      expect(useExecutionsStore.getState().steps).toEqual(steps);
      expect(useExecutionsStore.getState().stepsStatus).toBe('ready');
    });

    it('should set status to error on failure', async () => {
      mockedSteps.mockRejectedValueOnce(new Error('boom'));

      await useExecutionsStore.getState().fetchSteps('exec-1');

      expect(useExecutionsStore.getState().stepsStatus).toBe('error');
      expect(useExecutionsStore.getState().stepsError).toBe('boom');
    });
  });
});
