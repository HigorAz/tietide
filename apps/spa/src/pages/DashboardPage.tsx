import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import type { StatusCount, TriggerCount, UsageRange } from '@/api/usage';
import { useUsageStore } from '@/stores/usageStore';
import { StatCard } from '@/components/usage/StatCard';
import { RunsPerDayChart } from '@/components/usage/RunsPerDayChart';
import { ErrorRateChart } from '@/components/usage/ErrorRateChart';
import { TopWorkflowsTable } from '@/components/usage/TopWorkflowsTable';
import { DonutChart, type DonutDatum } from '@/components/usage/DonutChart';
import { BusiestHoursChart } from '@/components/usage/BusiestHoursChart';
import { RecentFailuresList } from '@/components/usage/RecentFailuresList';
import { ConnectionHealthCard } from '@/components/usage/ConnectionHealthCard';
import { NodeFailuresTable } from '@/components/usage/NodeFailuresTable';
import { cn } from '@/utils/cn';

const RANGE_OPTIONS: { value: UsageRange; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

const formatPercent = (n: number): string => `${Math.round(n * 100)}%`;

const formatDuration = (ms: number): string => {
  if (ms <= 0) return '0 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatRangeHint = (range: UsageRange): string => `last ${range.replace('d', '')} days`;

// Donut palette keyed by execution status / a teal-leaning sequence for triggers.
const STATUS_COLORS: Record<string, string> = {
  SUCCESS: '#12B886',
  FAILED: '#FF6B6B',
  RUNNING: '#00D4B3',
  PENDING: '#F59F00',
  CANCELLED: '#6B7C93',
  SKIPPED: '#4C6EF5',
};

const TRIGGER_PALETTE = [
  '#00D4B3',
  '#4C6EF5',
  '#F59F00',
  '#FF6B6B',
  '#12B886',
  '#A98EDA',
  '#6B7C93',
];

const toStatusDonut = (rows: StatusCount[]): DonutDatum[] =>
  rows.map((s) => ({
    name: s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] ?? '#6B7C93',
  }));

const toTriggerDonut = (rows: TriggerCount[]): DonutDatum[] =>
  rows.map((t, i) => ({
    name: t.triggerType,
    value: t.count,
    color: TRIGGER_PALETTE[i % TRIGGER_PALETTE.length],
  }));

export function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const { summary, status, error, range, fetch, setRange } = useUsageStore();

  useEffect(() => {
    void fetch(range);
  }, [range, fetch]);

  const handleRange = (value: string): void => {
    setRange(value as UsageRange);
  };

  const handleRowClick = (id: string): void => {
    navigate(`/workflows/${id}`, { state: { from: '/dashboard' } });
  };

  return (
    <div className="flex flex-col">
      <header className="border-b border-white/5 bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div>
            <h1 className="text-lg font-semibold">Usage</h1>
            <p className="text-xs text-text-secondary">
              Execution analytics across your workflows.
            </p>
          </div>
          <Tabs.Root value={range} onValueChange={handleRange}>
            <Tabs.List
              aria-label="Time range"
              className="inline-flex items-center gap-1 rounded-md border border-white/5 bg-elevated p-1"
            >
              {RANGE_OPTIONS.map((option) => (
                <Tabs.Trigger
                  key={option.value}
                  value={option.value}
                  className={cn(
                    'rounded px-3 py-1 text-xs font-medium text-text-secondary transition',
                    'hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal',
                    'data-[state=active]:bg-accent-teal/15 data-[state=active]:text-accent-teal',
                  )}
                >
                  {option.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </Tabs.Root>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
        {status === 'loading' && !summary && (
          <p className="text-sm text-text-secondary">Loading usage…</p>
        )}

        {status === 'error' && (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error"
          >
            <p>{error ?? 'Something went wrong'}</p>
            <button
              type="button"
              onClick={() => void fetch(range)}
              className="rounded-md bg-error/20 px-3 py-1 text-xs font-semibold text-error transition hover:bg-error/30"
            >
              Retry
            </button>
          </div>
        )}

        {summary && (
          <>
            <section
              aria-label="Summary metrics"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <StatCard
                label="Total runs"
                value={summary.totalRuns.toLocaleString()}
                delta={summary.comparison.totalRunsDelta}
                hint={formatRangeHint(range)}
              />
              <StatCard
                label="Success rate"
                value={formatPercent(summary.successRate)}
                delta={summary.comparison.successRateDelta}
                hint={formatRangeHint(range)}
              />
              <StatCard
                label="Avg duration"
                value={formatDuration(summary.avgDurationMs)}
                delta={summary.comparison.avgDurationDelta}
                invertDelta
                hint="across terminal runs"
              />
              <StatCard
                label="Active workflows"
                value={summary.activeWorkflows.toLocaleString()}
                hint="currently enabled"
              />
            </section>

            <section aria-label="Run trends" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <RunsPerDayChart data={summary.runsPerDay} />
              <ErrorRateChart data={summary.runsPerDay} />
            </section>

            <section aria-label="Distributions" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <DonutChart
                title="Execution status"
                data={toStatusDonut(summary.statusBreakdown)}
                emptyMessage="No executions in this window yet."
                testId="status-donut"
              />
              <DonutChart
                title="Trigger types"
                data={toTriggerDonut(summary.triggerDistribution)}
                emptyMessage="No executions in this window yet."
                testId="trigger-donut"
              />
            </section>

            <BusiestHoursChart data={summary.busiestHours} />

            <section aria-label="Triage" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <RecentFailuresList items={summary.recentFailures} />
              <ConnectionHealthCard items={summary.connectionHealth} />
            </section>

            <NodeFailuresTable rows={summary.nodeFailures} />

            <TopWorkflowsTable rows={summary.topWorkflows} onRowClick={handleRowClick} />
          </>
        )}
      </main>
    </div>
  );
}

export default DashboardPage;
