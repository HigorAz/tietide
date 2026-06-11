import { useEffect, useMemo, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExecutionsStore } from '@/stores/executionsStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { StatusBadge } from '@/components/executions/StatusBadge';
import { computeDurationMs, formatDuration } from '@/components/executions/duration';
import { cn } from '@/utils/cn';
import type { ExecutionStatus } from '@/api/executions';

const STATUS_OPTIONS: { value: '' | ExecutionStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const formatStartedAt = (date: Date | string | null): string => {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString();
};

const toDateInputValue = (date: Date | undefined): string => {
  if (!date) return '';
  return date.toISOString().slice(0, 10);
};

const fromDateInputValue = (value: string): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export function GlobalHistoryPage(): JSX.Element {
  const navigate = useNavigate();

  const list = useExecutionsStore((s) => s.list);
  const listStatus = useExecutionsStore((s) => s.listStatus);
  const listError = useExecutionsStore((s) => s.listError);
  const listNextCursor = useExecutionsStore((s) => s.listNextCursor);
  const filters = useExecutionsStore((s) => s.filters);
  const fetchAll = useExecutionsStore((s) => s.fetchAll);
  const setFilters = useExecutionsStore((s) => s.setFilters);
  const loadMore = useExecutionsStore((s) => s.loadMore);

  const workflows = useWorkflowsStore((s) => s.workflows);
  const fetchWorkflows = useWorkflowsStore((s) => s.fetch);

  useEffect(() => {
    void fetchWorkflows();
  }, [fetchWorkflows]);

  useEffect(() => {
    void fetchAll(filters);
  }, [fetchAll, filters]);

  const workflowNameById = useMemo(
    () => new Map(workflows.map((w) => [w.id, w.name])),
    [workflows],
  );

  const handleWorkflowChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.target.value;
    setFilters({ workflowId: value === '' ? undefined : value });
  };

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.target.value as '' | ExecutionStatus;
    setFilters({ status: value === '' ? undefined : value });
  };

  const handleFromChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setFilters({ from: fromDateInputValue(event.target.value) });
  };

  const handleToChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setFilters({ to: fromDateInputValue(event.target.value) });
  };

  const isEmpty = listStatus === 'ready' && list.length === 0;
  const isLoadingMore = listStatus === 'loading' && list.length > 0;

  return (
    <div className="flex flex-col">
      <header className="border-b border-white/5 bg-surface">
        <div className="mx-auto w-full max-w-6xl px-6 py-4">
          <h1 className="text-lg font-semibold">History</h1>
          <p className="text-xs text-text-secondary">
            Every execution across your workflows. Filter, scan, and click any row to replay it in
            the editor.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-4 px-6 py-6">
        <section
          aria-label="Filters"
          data-tour="history-filters"
          className="flex flex-wrap items-end gap-4 rounded-lg border border-white/5 bg-surface p-4"
        >
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>Workflow</span>
            <select
              value={filters.workflowId ?? ''}
              onChange={handleWorkflowChange}
              className="rounded border border-white/10 bg-deep-blue px-2 py-1 text-sm text-text-primary focus:border-accent-teal focus:outline-none"
            >
              <option value="">All workflows</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>Status</span>
            <select
              value={filters.status ?? ''}
              onChange={handleStatusChange}
              className="rounded border border-white/10 bg-deep-blue px-2 py-1 text-sm text-text-primary focus:border-accent-teal focus:outline-none"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>From</span>
            <input
              type="date"
              value={toDateInputValue(filters.from)}
              onChange={handleFromChange}
              className="rounded border border-white/10 bg-deep-blue px-2 py-1 text-sm text-text-primary focus:border-accent-teal focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>To</span>
            <input
              type="date"
              value={toDateInputValue(filters.to)}
              onChange={handleToChange}
              className="rounded border border-white/10 bg-deep-blue px-2 py-1 text-sm text-text-primary focus:border-accent-teal focus:outline-none"
            />
          </label>
        </section>

        {listStatus === 'loading' && list.length === 0 && (
          <p className="text-sm text-text-secondary">Loading executions…</p>
        )}

        {listStatus === 'error' && (
          <div
            role="alert"
            className="rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error"
          >
            {listError ?? 'Something went wrong'}
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-white/10 bg-surface/40 p-12 text-center">
            <h2 className="text-base font-semibold text-text-primary">No executions yet</h2>
            <p className="max-w-sm text-sm text-text-secondary">
              When your workflows run, every execution will show up here with status, trigger, and
              duration.
            </p>
          </div>
        )}

        {list.length > 0 && (
          <div
            data-tour="history-list"
            className="overflow-x-auto rounded-lg border border-white/5 bg-surface"
          >
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-deep-blue/40 text-left text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-semibold">Workflow</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Trigger</th>
                  <th className="px-4 py-2 font-semibold">Started</th>
                  <th className="px-4 py-2 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => {
                  const duration = computeDurationMs(row.startedAt, row.finishedAt);
                  const handleOpen = (): void => {
                    navigate(`/workflows/${row.workflowId}?execution=${row.id}`);
                  };
                  return (
                    <tr
                      key={row.id}
                      data-testid={`execution-row-${row.id}`}
                      role="button"
                      aria-label={`Open execution ${row.id}`}
                      tabIndex={0}
                      onClick={handleOpen}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleOpen();
                        }
                      }}
                      className={cn(
                        'cursor-pointer border-t border-white/5 transition hover:bg-elevated',
                        'focus:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal',
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {workflowNameById.get(row.workflowId) ?? row.workflowId}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                        {row.isDryRun === true && (
                          <span
                            data-testid="dry-run-badge"
                            className="ml-2 inline-block rounded-full bg-accent-teal/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-teal"
                          >
                            Test
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.triggerType}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatStartedAt(row.startedAt ?? row.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatDuration(duration)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {listNextCursor && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={isLoadingMore}
              className="rounded-md border border-white/10 bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal disabled:opacity-50"
            >
              {isLoadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default GlobalHistoryPage;
