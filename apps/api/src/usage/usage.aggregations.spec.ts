import {
  ALL_EXECUTION_STATUSES,
  bucketRunsPerDay,
  computeAvgDurationMs,
  computeBusiestHours,
  computeComparison,
  computeStatusBreakdown,
  computeTriggerDistribution,
  utcDateKey,
  type ExecutionRow,
} from './usage.aggregations';

const NOW = new Date('2026-05-04T12:00:00Z'); // Monday

const row = (overrides: Partial<ExecutionRow> = {}): ExecutionRow => ({
  workflowId: overrides.workflowId ?? 'wf-a',
  status: overrides.status ?? 'SUCCESS',
  triggerType: overrides.triggerType ?? 'manual',
  startedAt:
    overrides.startedAt === undefined ? new Date('2026-05-04T10:00:00Z') : overrides.startedAt,
  finishedAt:
    overrides.finishedAt === undefined ? new Date('2026-05-04T10:00:01Z') : overrides.finishedAt,
  createdAt: overrides.createdAt ?? new Date('2026-05-04T10:00:00Z'),
});

describe('usage.aggregations', () => {
  describe('computeAvgDurationMs', () => {
    it('averages finishedAt - startedAt across terminal rows', () => {
      const rows = [
        row({
          startedAt: new Date('2026-05-04T10:00:00Z'),
          finishedAt: new Date('2026-05-04T10:00:01Z'),
        }),
        row({
          startedAt: new Date('2026-05-04T10:00:00Z'),
          finishedAt: new Date('2026-05-04T10:00:03Z'),
        }),
      ];
      expect(computeAvgDurationMs(rows)).toBe(2000);
    });

    it('excludes rows missing startedAt or finishedAt', () => {
      const rows = [
        row({
          startedAt: new Date('2026-05-04T10:00:00Z'),
          finishedAt: new Date('2026-05-04T10:00:02Z'),
        }),
        row({ startedAt: new Date('2026-05-04T10:00:00Z'), finishedAt: null }),
      ];
      expect(computeAvgDurationMs(rows)).toBe(2000);
    });

    it('returns 0 when no rows are terminal', () => {
      expect(computeAvgDurationMs([row({ startedAt: null, finishedAt: null })])).toBe(0);
    });
  });

  describe('bucketRunsPerDay', () => {
    it('returns a zero-filled array of rangeDays length with UTC keys ending today', () => {
      const points = bucketRunsPerDay([], NOW, 7);
      expect(points).toHaveLength(7);
      expect(points.map((p) => p.date)).toEqual([
        '2026-04-28',
        '2026-04-29',
        '2026-04-30',
        '2026-05-01',
        '2026-05-02',
        '2026-05-03',
        '2026-05-04',
      ]);
      expect(points.every((p) => p.count === 0 && p.failed === 0)).toBe(true);
    });

    it('counts total and FAILED per day', () => {
      const rows = [
        row({ status: 'SUCCESS', startedAt: new Date('2026-05-04T01:00:00Z'), finishedAt: null }),
        row({ status: 'FAILED', startedAt: new Date('2026-05-04T02:00:00Z'), finishedAt: null }),
        row({ status: 'FAILED', startedAt: new Date('2026-05-03T02:00:00Z'), finishedAt: null }),
      ];
      const points = bucketRunsPerDay(rows, NOW, 7);
      const byDate = new Map(points.map((p) => [p.date, p]));
      expect(byDate.get('2026-05-04')).toEqual({ date: '2026-05-04', count: 2, failed: 1 });
      expect(byDate.get('2026-05-03')).toEqual({ date: '2026-05-03', count: 1, failed: 1 });
    });

    it('falls back to createdAt when startedAt is null', () => {
      const rows = [
        row({ startedAt: null, finishedAt: null, createdAt: new Date('2026-05-02T08:00:00Z') }),
      ];
      const points = bucketRunsPerDay(rows, NOW, 7);
      expect(new Map(points.map((p) => [p.date, p.count])).get('2026-05-02')).toBe(1);
    });
  });

  describe('computeStatusBreakdown', () => {
    it('returns every status zero-filled in a stable order', () => {
      const result = computeStatusBreakdown([]);
      expect(result.map((s) => s.status)).toEqual([...ALL_EXECUTION_STATUSES]);
      expect(result.every((s) => s.count === 0)).toBe(true);
    });

    it('counts executions by status', () => {
      const rows = [
        row({ status: 'SUCCESS' }),
        row({ status: 'SUCCESS' }),
        row({ status: 'FAILED' }),
        row({ status: 'RUNNING' }),
      ];
      const byStatus = new Map(computeStatusBreakdown(rows).map((s) => [s.status, s.count]));
      expect(byStatus.get('SUCCESS')).toBe(2);
      expect(byStatus.get('FAILED')).toBe(1);
      expect(byStatus.get('RUNNING')).toBe(1);
      expect(byStatus.get('PENDING')).toBe(0);
    });
  });

  describe('computeTriggerDistribution', () => {
    it('groups by triggerType ordered by count desc', () => {
      const rows = [
        row({ triggerType: 'cron' }),
        row({ triggerType: 'cron' }),
        row({ triggerType: 'cron' }),
        row({ triggerType: 'webhook' }),
        row({ triggerType: 'provider:stripe' }),
        row({ triggerType: 'provider:stripe' }),
      ];
      const result = computeTriggerDistribution(rows);
      expect(result[0]).toEqual({ triggerType: 'cron', count: 3 });
      expect(result[1]).toEqual({ triggerType: 'provider:stripe', count: 2 });
      expect(result[2]).toEqual({ triggerType: 'webhook', count: 1 });
    });

    it('returns an empty array for no executions', () => {
      expect(computeTriggerDistribution([])).toEqual([]);
    });
  });

  describe('computeBusiestHours', () => {
    it('returns 24 zero-filled hour buckets', () => {
      const result = computeBusiestHours([]);
      expect(result).toHaveLength(24);
      expect(result.map((h) => h.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
      expect(result.every((h) => h.count === 0)).toBe(true);
    });

    it('buckets by UTC hour of startedAt (falling back to createdAt)', () => {
      const rows = [
        row({ startedAt: new Date('2026-05-04T10:30:00Z'), finishedAt: null }),
        row({ startedAt: new Date('2026-05-03T10:05:00Z'), finishedAt: null }),
        row({ startedAt: null, finishedAt: null, createdAt: new Date('2026-05-02T23:00:00Z') }),
      ];
      const byHour = new Map(computeBusiestHours(rows).map((h) => [h.hour, h.count]));
      expect(byHour.get(10)).toBe(2);
      expect(byHour.get(23)).toBe(1);
      expect(byHour.get(0)).toBe(0);
    });
  });

  describe('computeComparison', () => {
    it('computes relative deltas for totalRuns and avgDuration, absolute for successRate', () => {
      const result = computeComparison(
        { totalRuns: 150, successRate: 0.9, avgDurationMs: 1200 },
        { totalRuns: 100, successRate: 0.8, avgDurationMs: 1000 },
      );
      expect(result.totalRunsDelta).toBeCloseTo(0.5, 5);
      expect(result.successRateDelta).toBeCloseTo(0.1, 5);
      expect(result.avgDurationDelta).toBeCloseTo(0.2, 5);
    });

    it('returns null deltas (no divide-by-zero) when the prior window is empty', () => {
      const result = computeComparison(
        { totalRuns: 10, successRate: 1, avgDurationMs: 500 },
        { totalRuns: 0, successRate: 0, avgDurationMs: 0 },
      );
      expect(result.totalRunsDelta).toBeNull();
      expect(result.avgDurationDelta).toBeNull();
      expect(result.successRateDelta).toBe(1);
    });

    it('handles a negative (downward) trend', () => {
      const result = computeComparison(
        { totalRuns: 50, successRate: 0.5, avgDurationMs: 800 },
        { totalRuns: 100, successRate: 0.9, avgDurationMs: 1000 },
      );
      expect(result.totalRunsDelta).toBeCloseTo(-0.5, 5);
      expect(result.successRateDelta).toBeCloseTo(-0.4, 5);
      expect(result.avgDurationDelta).toBeCloseTo(-0.2, 5);
    });
  });

  describe('utcDateKey', () => {
    it('formats a Date as UTC YYYY-MM-DD', () => {
      expect(utcDateKey(new Date('2026-05-04T23:59:59Z'))).toBe('2026-05-04');
    });
  });
});
