import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useExecutionsStore } from '@/stores/executionsStore';
import { StatusBadge } from '@/components/executions/StatusBadge';
import { StepCard } from '@/components/executions/StepCard';
import { computeDurationMs, formatDuration } from '@/components/executions/duration';

const formatTimestamp = (date: Date | string | null): string => {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString();
};

export function ExecutionDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();

  const detail = useExecutionsStore((s) => s.detail);
  const detailStatus = useExecutionsStore((s) => s.detailStatus);
  const detailError = useExecutionsStore((s) => s.detailError);
  const fetchDetail = useExecutionsStore((s) => s.fetchDetail);

  const steps = useExecutionsStore((s) => s.steps);
  const stepsStatus = useExecutionsStore((s) => s.stepsStatus);
  const stepsError = useExecutionsStore((s) => s.stepsError);
  const fetchSteps = useExecutionsStore((s) => s.fetchSteps);

  useEffect(() => {
    if (!id) return;
    void fetchDetail(id);
    void fetchSteps(id);
  }, [id, fetchDetail, fetchSteps]);

  const totalDuration = detail ? computeDurationMs(detail.startedAt, detail.finishedAt) : null;

  const backHref = detail ? `/workflows/${detail.workflowId}/executions` : '/dashboard';

  return (
    <div className="min-h-screen bg-deep-blue text-text-primary">
      <header className="border-b border-white/5 bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              to={backHref}
              aria-label="Back to executions"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-text-secondary hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal"
            >
              <ArrowLeft size={14} aria-hidden />
              Back
            </Link>
            <div>
              <h1 className="text-lg font-semibold">Execution detail</h1>
              <p className="font-mono text-xs text-text-secondary">{id}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-6">
        {detailStatus === 'loading' && !detail && (
          <p className="text-sm text-text-secondary">Loading execution…</p>
        )}

        {detailStatus === 'error' && (
          <div
            role="alert"
            className="rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error"
          >
            {detailError ?? 'Something went wrong'}
          </div>
        )}

        {detail && (
          <section
            aria-label="Execution summary"
            className="grid grid-cols-2 gap-4 rounded-lg border border-white/5 bg-surface p-4 sm:grid-cols-4"
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                Status
              </p>
              <div className="mt-1">
                <StatusBadge status={detail.status} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                Trigger
              </p>
              <p className="mt-1 text-sm capitalize">{detail.triggerType}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                Started
              </p>
              <p className="mt-1 text-sm text-text-primary">
                {formatTimestamp(detail.startedAt ?? detail.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                Duration
              </p>
              <p className="mt-1 text-sm text-text-primary">{formatDuration(totalDuration)}</p>
            </div>
            {detail.error && (
              <p
                role="alert"
                className="col-span-full rounded border border-error/30 bg-error/10 px-3 py-2 text-xs text-error"
              >
                {detail.error}
              </p>
            )}
          </section>
        )}

        <section aria-label="Step timeline" className="space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Step timeline</h2>

          {stepsStatus === 'error' && (
            <div
              role="alert"
              className="rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error"
            >
              {stepsError ?? 'Failed to load steps'}
            </div>
          )}

          {stepsStatus === 'ready' && steps.length === 0 && (
            <p className="rounded border border-dashed border-white/10 bg-surface/40 p-6 text-center text-sm text-text-secondary">
              No steps recorded for this execution yet.
            </p>
          )}

          {steps.length > 0 && (
            <ol className="space-y-3">
              {steps.map((step) => (
                <li key={step.id}>
                  <StepCard step={step} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}

export default ExecutionDetailPage;
