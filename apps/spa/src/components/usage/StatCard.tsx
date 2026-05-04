import { cn } from '@/utils/cn';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}

export function StatCard({ label, value, hint, className }: StatCardProps): JSX.Element {
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
      {hint && <span className="text-xs text-text-secondary">{hint}</span>}
    </div>
  );
}
