import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ExecutionStep } from '@tietide/shared';
import { cn } from '@/utils/cn';
import { StatusBadge } from './StatusBadge';
import { formatDuration } from './duration';

export interface StepCardProps {
  step: ExecutionStep;
}

const stringifyPayload = (payload: Record<string, unknown> | null): string | null => {
  if (payload === null) return null;
  return JSON.stringify(payload, null, 2);
};

function PayloadBlock({
  label,
  payload,
}: {
  label: string;
  payload: Record<string, unknown> | null;
}): JSX.Element {
  const json = stringifyPayload(payload);
  return (
    <div className="space-y-1">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </h4>
      {json === null ? (
        <p className="rounded bg-deep-blue/40 px-2 py-1.5 text-xs italic text-text-secondary">
          No payload
        </p>
      ) : (
        <pre className="overflow-x-auto rounded bg-deep-blue/40 p-2 text-xs text-text-primary">
          {json}
        </pre>
      )}
    </div>
  );
}

export function StepCard({ step }: StepCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const isFailed = step.status === 'FAILED';

  return (
    <article
      data-testid={`step-card-${step.id}`}
      data-status={step.status}
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-4 text-sm transition',
        isFailed
          ? 'border-error/40 bg-error/5'
          : 'border-white/5 bg-surface hover:border-accent-teal/30',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text-primary" title={step.nodeName}>
            {step.nodeName}
          </h3>
          <p className="text-xs text-text-secondary">{step.nodeType}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={step.status} />
          <span className="text-xs text-text-secondary">{formatDuration(step.durationMs)}</span>
        </div>
      </header>

      {isFailed && step.error && (
        <p
          role="alert"
          className="rounded border border-error/30 bg-error/10 px-2 py-1.5 text-xs text-error"
        >
          {step.error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className={cn(
          'inline-flex w-fit items-center gap-1 text-xs font-medium text-accent-teal',
          'hover:text-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
        )}
      >
        {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <PayloadBlock label="Input" payload={step.inputData} />
          <PayloadBlock label="Output" payload={step.outputData} />
        </div>
      )}
    </article>
  );
}
