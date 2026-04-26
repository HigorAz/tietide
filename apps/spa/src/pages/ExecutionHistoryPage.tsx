import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { Workflow } from '@tietide/shared';
import { useExecutionsStore } from '@/stores/executionsStore';
import { getWorkflow } from '@/api/workflows';
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

export function ExecutionHistoryPage(): JSX.Element {
  const { id: workflowId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);

  const list = useExecutionsStore((s) => s.list);
  const listStatus = useExecutionsStore((s) => s.listStatus);
  const listError = useExecutionsStore((s) => s.listError);
  const filters = useExecutionsStore((s) => s.filters);
  const fetchList = useExecutionsStore((s) => s.fetchList);
  const setFilters = useExecutionsStore((s) => s.setFilters);

  useEffect(() => {
    if (!workflowId) return;
    let cancelled = false;
    getWorkflow(workflowId)
      .then((wf) => {
        if (!cancelled) setWorkflow(wf);
      })
      .catch(() => {
        if (!cancelled) setWorkflow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  useEffect(() => {
    if (!workflowId) return;
    void fetchList(workflowId);
  }, [workflowId, fetchList, filters]);

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

  const isEmpty = useMemo(
    () => listStatus === 'ready' && list.length === 0,
    [listStatus, list.length],
  );

  return (
    <div className="min-h-screen bg-deep-blue text-text-primary">
      <header className="border-b border-white/5 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              aria-label="Back to dashboard"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-text-secondary hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal"
            >
              <ArrowLeft size={14} aria-hidden />
              Back
            </Link>
            <div>
              <h1 className="text-lg font-semibold">
                {workflow ? `${workflow.name} — Executions` : 'Executions'}
              </h1>
              <p className="text-xs text-text-secondary">
                Inspect every run, filter by status or time, and dig into per-node details.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-6 py-6">
        <section
          aria-label="Filters"
          className="flex flex-wrap items-end gap-4 rounded-lg border border-white/5 bg-surface p-4"
        >
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
              When this workflow runs, you'll see each execution here with status, trigger, and
              duration.
            </p>
          </div>
        )}

        {list.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-white/5 bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-deep-blue/40 text-left text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Trigger</th>
                  <th className="px-4 py-2 font-semibold">Started</th>
                  <th className="px-4 py-2 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => {
                  const duration = computeDurationMs(row.startedAt, row.finishedAt);
                  return (
                    <tr
                      key={row.id}
                      data-testid={`execution-row-${row.id}`}
                      role="button"
                      aria-label={`Open execution ${row.id}`}
                      tabIndex={0}
                      onClick={() => navigate(`/executions/${row.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigate(`/executions/${row.id}`);
                        }
                      }}
                      className={cn(
                        'cursor-pointer border-t border-white/5 transition hover:bg-elevated',
                        'focus:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal',
                      )}
                    >
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
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
      </main>
    </div>
  );
}

export default ExecutionHistoryPage;
