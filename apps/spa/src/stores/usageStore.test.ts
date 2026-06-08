import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/usage', () => ({
  getUsageSummary: vi.fn(),
}));

import * as usageApi from '@/api/usage';
import type { UsageSummary } from '@/api/usage';
import { initialUsageState, useUsageStore } from './usageStore';

const mockedFetch = vi.mocked(usageApi.getUsageSummary);

const sample: UsageSummary = {
  totalRuns: 5,
  successRate: 0.8,
  avgDurationMs: 1200,
  activeWorkflows: 2,
  runsPerDay: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-05-0${i + 1}`,
    count: i,
    failed: 0,
  })),
  topWorkflows: [{ id: 'wf-a', name: 'Alpha', runs: 4, successRate: 1 }],
  statusBreakdown: [{ status: 'SUCCESS', count: 4 }],
  triggerDistribution: [{ triggerType: 'manual', count: 5 }],
  busiestHours: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
  recentFailures: [],
  connectionHealth: [{ status: 'ACTIVE', count: 1 }],
  nodeFailures: [],
  comparison: { totalRunsDelta: null, successRateDelta: 0, avgDurationDelta: null },
};

const reset = (): void => {
  useUsageStore.setState({ ...initialUsageState });
};

describe('useUsageStore', () => {
  beforeEach(() => {
    reset();
    mockedFetch.mockReset();
  });

  it('starts in idle status with no summary', () => {
    const state = useUsageStore.getState();
    expect(state.status).toBe('idle');
    expect(state.summary).toBeNull();
    expect(state.range).toBe('7d');
  });

  it('transitions idle → loading → ready and stores the summary', async () => {
    mockedFetch.mockResolvedValueOnce(sample);

    const promise = useUsageStore.getState().fetch('7d');
    expect(useUsageStore.getState().status).toBe('loading');

    await promise;
    expect(useUsageStore.getState().status).toBe('ready');
    expect(useUsageStore.getState().summary).toEqual(sample);
    expect(useUsageStore.getState().error).toBeNull();
  });

  it('transitions to error and surfaces the message when the fetch rejects', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('network down'));

    await useUsageStore.getState().fetch('7d');

    expect(useUsageStore.getState().status).toBe('error');
    expect(useUsageStore.getState().error).toBe('network down');
    expect(useUsageStore.getState().summary).toBeNull();
  });

  it('forwards the range argument to the API', async () => {
    mockedFetch.mockResolvedValue(sample);

    await useUsageStore.getState().fetch('90d');

    expect(mockedFetch).toHaveBeenCalledWith('90d');
    expect(useUsageStore.getState().range).toBe('90d');
  });

  it('falls back to the current state range when fetch is called without an argument', async () => {
    mockedFetch.mockResolvedValue(sample);
    useUsageStore.setState({ range: '30d' });

    await useUsageStore.getState().fetch();

    expect(mockedFetch).toHaveBeenCalledWith('30d');
  });

  it('setRange updates the range without triggering a fetch (useEffect drives fetching)', () => {
    useUsageStore.getState().setRange('90d');

    expect(useUsageStore.getState().range).toBe('90d');
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
