import { cn } from '@/utils/cn';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  /**
   * Relative change vs the prior period (e.g. 0.5 = +50%). `null` means the prior
   * window had no data to compare against; omit entirely to hide the indicator.
   */
  delta?: number | null;
  /** When true, a downward delta is the good (green) direction — e.g. avg duration. */
  invertDelta?: boolean;
  className?: string;
}

function DeltaBadge({
  delta,
  invertDelta,
}: {
  delta: number | null;
  invertDelta: boolean;
}): JSX.Element {
  if (delta === null) {
    return (
      <span data-testid="stat-delta" className="text-xs text-text-secondary">
        — no prior data
      </span>
    );
  }
  const pct = `${Math.abs(Math.round(delta * 100))}%`;
  const up = delta >= 0;
  const good = invertDelta ? delta <= 0 : delta >= 0;
  return (
    <span
      data-testid="stat-delta"
      className={cn('text-xs font-medium tabular-nums', good ? 'text-success' : 'text-error')}
    >
      {up ? '▲' : '▼'} {pct}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  delta,
  invertDelta = false,
  className,
}: StatCardProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border border-white/5 bg-surface p-4',
        className,
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      <span className="text-2xl font-semibold text-text-primary tabular-nums">{value}</span>
      {delta !== undefined && <DeltaBadge delta={delta} invertDelta={invertDelta} />}
      {hint && <span className="text-xs text-text-secondary">{hint}</span>}
    </div>
  );
}
