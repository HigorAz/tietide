import { type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';

export type StepStatus = 'pending' | 'active' | 'done' | 'locked';

export interface StepSectionProps {
  /** Displayed number (renumbers when an earlier step is skipped). */
  index: number;
  /** 'Connection' | 'Configure' | 'Test'. */
  title: string;
  status: StepStatus;
  /** Shown in the header when collapsed (e.g. 'My Google · active'). */
  summary?: string;
  /**
   * Whether this step's body is expanded. The guided flow keeps exactly one step
   * open; the expanded layout (a previously-tested node) opens them all. The
   * parent decides — this component just renders the flag.
   */
  open: boolean;
  /** Parent opens this step; ignored when locked. */
  onToggle: () => void;
  /**
   * When true, the body stays mounted while closed (gets the `hidden` class)
   * so a portal target inside survives collapse. Default false → body unmounts.
   */
  keepMounted?: boolean;
  children: ReactNode;
  'data-testid'?: string;
}

const bubbleClass: Record<StepStatus, string> = {
  done: 'border-status-success bg-status-success/20 text-status-success',
  active: 'border-accent-teal bg-accent-teal/10 text-accent-teal',
  pending: 'border-white/15 text-text-secondary',
  locked: 'border-white/15 text-text-secondary',
};

export function StepSection({
  index,
  title,
  status,
  summary,
  open,
  onToggle,
  keepMounted = false,
  children,
  'data-testid': dataTestId,
}: StepSectionProps): JSX.Element {
  const locked = status === 'locked';

  return (
    <section data-testid={dataTestId} data-status={status} className={cn(locked && 'opacity-55')}>
      <button
        type="button"
        onClick={onToggle}
        disabled={locked}
        aria-disabled={locked}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-3 text-left',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal',
          locked && 'cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
            bubbleClass[status],
          )}
        >
          {status === 'done' ? <Check size={12} aria-hidden /> : index}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-text-primary">{title}</span>
          {!open && summary && <span className="truncate text-xs text-text-muted">{summary}</span>}
        </span>
      </button>

      {keepMounted ? (
        <div className={open ? 'mt-2.5 pl-9' : 'hidden'}>{children}</div>
      ) : (
        open && <div className="mt-2.5 pl-9">{children}</div>
      )}
    </section>
  );
}
