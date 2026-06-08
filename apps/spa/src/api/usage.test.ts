import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from './client';
import { getUsageSummary, type UsageSummary } from './usage';

const mockedGet = vi.mocked(api.get);

const sampleSummary: UsageSummary = {
  totalRuns: 142,
  successRate: 0.93,
  avgDurationMs: 4200,
  activeWorkflows: 7,
  runsPerDay: [{ date: '2026-04-28', count: 18, failed: 1 }],
  topWorkflows: [{ id: 'wf-a', name: 'Alpha', runs: 42, successRate: 0.95 }],
  statusBreakdown: [{ status: 'SUCCESS', count: 18 }],
  triggerDistribution: [{ triggerType: 'cron', count: 18 }],
  busiestHours: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
  recentFailures: [],
  connectionHealth: [{ status: 'ACTIVE', count: 1 }],
  nodeFailures: [],
  comparison: { totalRunsDelta: 0.1, successRateDelta: 0.05, avgDurationDelta: null },
};

describe('usage API client', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('GETs /usage/summary with the given range and returns the parsed body', async () => {
    mockedGet.mockResolvedValueOnce({ data: sampleSummary });

    const result = await getUsageSummary('30d');

    expect(mockedGet).toHaveBeenCalledWith('/usage/summary', { params: { range: '30d' } });
    expect(result).toEqual(sampleSummary);
  });

  it('defaults the range to "7d" when omitted', async () => {
    mockedGet.mockResolvedValueOnce({ data: sampleSummary });

    await getUsageSummary();

    expect(mockedGet).toHaveBeenCalledWith('/usage/summary', { params: { range: '7d' } });
  });

  it('propagates axios errors', async () => {
    const err = new Error('network');
    mockedGet.mockRejectedValueOnce(err);

    await expect(getUsageSummary('7d')).rejects.toBe(err);
  });
});
