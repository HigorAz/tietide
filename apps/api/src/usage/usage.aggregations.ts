import type {
  BusiestHourDto,
  PeriodComparisonDto,
  RunsPerDayPointDto,
  StatusCountDto,
  TriggerCountDto,
} from './dto/usage-summary-response.dto';

/** Execution row shape the pure aggregations operate on (subset of WorkflowExecution). */
export interface ExecutionRow {
  workflowId: string;
  status: string;
  triggerType: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

/** Window totals fed into computeComparison. */
export interface PeriodTotals {
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
}

/** Stable donut order: terminal-good first, then failure/in-flight states. */
export const ALL_EXECUTION_STATUSES = [
  'SUCCESS',
  'FAILED',
  'RUNNING',
  'PENDING',
  'CANCELLED',
  'SKIPPED',
] as const;

const HOURS_IN_DAY = 24;

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Average finishedAt - startedAt across rows that have both timestamps; 0 when none. */
export function computeAvgDurationMs(rows: ExecutionRow[]): number {
  let totalMs = 0;
  let n = 0;
  for (const e of rows) {
    if (e.startedAt && e.finishedAt) {
      totalMs += e.finishedAt.getTime() - e.startedAt.getTime();
      n += 1;
    }
  }
  return n === 0 ? 0 : Math.round(totalMs / n);
}

/** Zero-filled daily buckets over the rolling window, carrying total and FAILED counts. */
export function bucketRunsPerDay(
  rows: ExecutionRow[],
  now: Date,
  rangeDays: number,
): RunsPerDayPointDto[] {
  const totals = new Map<string, number>();
  const failures = new Map<string, number>();
  for (const e of rows) {
    const key = utcDateKey(e.startedAt ?? e.createdAt);
    totals.set(key, (totals.get(key) ?? 0) + 1);
    if (e.status === 'FAILED') failures.set(key, (failures.get(key) ?? 0) + 1);
  }

  const points: RunsPerDayPointDto[] = [];
  const todayMidnightUtc = utcMidnight(now);
  for (let i = rangeDays - 1; i >= 0; i--) {
    const day = new Date(todayMidnightUtc.getTime() - i * 24 * 60 * 60 * 1000);
    const key = utcDateKey(day);
    points.push({ date: key, count: totals.get(key) ?? 0, failed: failures.get(key) ?? 0 });
  }
  return points;
}

/** Counts per execution status, every status present and zero-filled, in a stable order. */
export function computeStatusBreakdown(rows: ExecutionRow[]): StatusCountDto[] {
  const counts = new Map<string, number>();
  for (const e of rows) counts.set(e.status, (counts.get(e.status) ?? 0) + 1);
  return ALL_EXECUTION_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

/** Runs grouped by triggerType, ordered by count desc then name asc for stability. */
export function computeTriggerDistribution(rows: ExecutionRow[]): TriggerCountDto[] {
  const counts = new Map<string, number>();
  for (const e of rows) counts.set(e.triggerType, (counts.get(e.triggerType) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([triggerType, count]) => ({ triggerType, count }))
    .sort((a, b) => b.count - a.count || a.triggerType.localeCompare(b.triggerType));
}

/** 24 zero-filled hour-of-day (UTC) buckets. */
export function computeBusiestHours(rows: ExecutionRow[]): BusiestHourDto[] {
  const counts = new Array<number>(HOURS_IN_DAY).fill(0);
  for (const e of rows) {
    const hour = (e.startedAt ?? e.createdAt).getUTCHours();
    counts[hour] += 1;
  }
  return counts.map((count, hour) => ({ hour, count }));
}

/**
 * Deltas vs the prior equivalent window. totalRuns/avgDuration are relative changes
 * (null when the prior value is 0 — the divide-by-zero guard); successRate is an
 * absolute point change since both operands already live in [0, 1].
 */
export function computeComparison(curr: PeriodTotals, prev: PeriodTotals): PeriodComparisonDto {
  return {
    totalRunsDelta:
      prev.totalRuns === 0 ? null : (curr.totalRuns - prev.totalRuns) / prev.totalRuns,
    successRateDelta: curr.successRate - prev.successRate,
    avgDurationDelta:
      prev.avgDurationMs === 0
        ? null
        : (curr.avgDurationMs - prev.avgDurationMs) / prev.avgDurationMs,
  };
}
