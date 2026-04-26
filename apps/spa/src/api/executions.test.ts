import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionStep, WorkflowExecution } from '@tietide/shared';

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from './client';
import {
  listExecutions,
  getExecution,
  listExecutionSteps,
  type ExecutionListResponse,
  type ExecutionFilters,
} from './executions';

const mockedGet = vi.mocked(api.get);

const sampleExecution: WorkflowExecution = {
  id: '11111111-1111-4111-8111-111111111111',
  workflowId: '22222222-2222-4222-8222-222222222222',
  status: 'SUCCESS',
  triggerType: 'manual',
  triggerData: null,
  startedAt: new Date('2026-04-20T10:00:00Z'),
  finishedAt: new Date('2026-04-20T10:00:05Z'),
  error: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
};

const sampleListResponse: ExecutionListResponse = {
  items: [sampleExecution],
  total: 1,
  page: 1,
  pageSize: 20,
};

const sampleStep: ExecutionStep = {
  id: '33333333-3333-4333-8333-333333333333',
  executionId: sampleExecution.id,
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
};

describe('executions API client', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  describe('listExecutions', () => {
    it('should GET /workflows/:id/executions and return the paginated payload', async () => {
      mockedGet.mockResolvedValueOnce({ data: sampleListResponse });

      const result = await listExecutions(sampleExecution.workflowId);

      expect(mockedGet).toHaveBeenCalledWith(
        `/workflows/${sampleExecution.workflowId}/executions`,
        { params: {} },
      );
      expect(result).toEqual(sampleListResponse);
    });

    it('should forward filter params (status, from, to, page, pageSize) when provided', async () => {
      mockedGet.mockResolvedValueOnce({ data: sampleListResponse });
      const filters: ExecutionFilters = {
        status: 'FAILED',
        from: new Date('2026-04-01T00:00:00Z'),
        to: new Date('2026-04-30T00:00:00Z'),
        page: 2,
        pageSize: 50,
      };

      await listExecutions(sampleExecution.workflowId, filters);

      expect(mockedGet).toHaveBeenCalledWith(
        `/workflows/${sampleExecution.workflowId}/executions`,
        {
          params: {
            status: 'FAILED',
            from: '2026-04-01T00:00:00.000Z',
            to: '2026-04-30T00:00:00.000Z',
            page: 2,
            pageSize: 50,
          },
        },
      );
    });

    it('should propagate axios errors', async () => {
      const err = new Error('network');
      mockedGet.mockRejectedValueOnce(err);

      await expect(listExecutions(sampleExecution.workflowId)).rejects.toBe(err);
    });
  });

  describe('getExecution', () => {
    it('should GET /executions/:id and return the execution', async () => {
      mockedGet.mockResolvedValueOnce({ data: sampleExecution });

      const result = await getExecution(sampleExecution.id);

      expect(mockedGet).toHaveBeenCalledWith(`/executions/${sampleExecution.id}`);
      expect(result).toEqual(sampleExecution);
    });

    it('should propagate axios errors', async () => {
      const err = new Error('not found');
      mockedGet.mockRejectedValueOnce(err);

      await expect(getExecution('missing')).rejects.toBe(err);
    });
  });

  describe('listExecutionSteps', () => {
    it('should GET /executions/:id/steps and return the steps array', async () => {
      mockedGet.mockResolvedValueOnce({ data: [sampleStep] });

      const result = await listExecutionSteps(sampleExecution.id);

      expect(mockedGet).toHaveBeenCalledWith(`/executions/${sampleExecution.id}/steps`);
      expect(result).toEqual([sampleStep]);
    });

    it('should propagate axios errors', async () => {
      const err = new Error('forbidden');
      mockedGet.mockRejectedValueOnce(err);

      await expect(listExecutionSteps('missing')).rejects.toBe(err);
    });
  });
});
