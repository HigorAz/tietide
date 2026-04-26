import { cn } from '@/utils/cn';

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

type Tone = 'success' | 'error' | 'running' | 'pending' | 'cancelled' | 'neutral';

const TONE_BY_STATUS: Record<string, Tone> = {
  SUCCESS: 'success',
  FAILED: 'error',
  RUNNING: 'running',
  PENDING: 'pending',
  CANCELLED: 'cancelled',
};

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success/15 text-success',
  error: 'bg-error/15 text-error',
  running: 'bg-accent-teal/15 text-accent-teal',
  pending: 'bg-white/5 text-text-secondary',
  cancelled: 'bg-white/5 text-text-secondary',
  neutral: 'bg-white/5 text-text-secondary',
};

const titleCase = (raw: string): string => {
  if (!raw) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
};

export function StatusBadge({ status, className }: StatusBadgeProps): JSX.Element {
  const tone: Tone = TONE_BY_STATUS[status] ?? 'neutral';
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {titleCase(status)}
    </span>
  );
}
