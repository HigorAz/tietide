import type { KeyboardEvent, MouseEvent } from 'react';
import { Activity, Power, Trash2 } from 'lucide-react';
import type { Workflow } from '@tietide/shared';
import { cn } from '@/utils/cn';
import { formatRelativeTime } from './relativeTime';

export interface WorkflowCardProps {
  workflow: Workflow;
  onOpen: (id: string) => void;
  onToggle: (id: string, next: boolean) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

const stop = (event: MouseEvent<HTMLElement>): void => {
  event.preventDefault();
  event.stopPropagation();
};

export function WorkflowCard({
  workflow,
  onOpen,
  onToggle,
  onDelete,
  disabled,
}: WorkflowCardProps): JSX.Element {
  const { id, name, isActive, updatedAt, executionCount } = workflow;

  const open = (): void => {
    if (disabled) return;
    onOpen(id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Open ${name}`}
      aria-disabled={disabled || undefined}
      onClick={open}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex w-full flex-col gap-4 rounded-lg border border-white/5 bg-surface p-4 text-left',
        'cursor-pointer transition hover:border-accent-teal/40 hover:bg-elevated',
        'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-semibold text-text-primary" title={name}>
          {name}
        </h3>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            isActive ? 'bg-accent-teal/15 text-accent-teal' : 'bg-white/5 text-text-secondary',
          )}
        >
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span
          data-testid="workflow-card-executions"
          aria-label={`${executionCount} executions`}
          className="inline-flex items-center gap-1.5"
        >
          <Activity aria-hidden="true" className="h-3.5 w-3.5" />
          {executionCount}
        </span>
        <span data-testid="workflow-card-updated">Updated {formatRelativeTime(updatedAt)}</span>
      </div>

      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          aria-label={`Toggle active for ${name}`}
          onClick={(event) => {
            stop(event);
            onToggle(id, !isActive);
          }}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition',
            'focus:outline-none focus:ring-1 focus:ring-accent-teal',
            isActive
              ? 'text-accent-teal hover:bg-accent-teal/10'
              : 'text-text-secondary hover:bg-white/5',
          )}
        >
          <Power aria-hidden="true" className="h-3.5 w-3.5" />
          {isActive ? 'On' : 'Off'}
        </button>
        <button
          type="button"
          aria-label={`Delete ${name}`}
          onClick={(event) => {
            stop(event);
            onDelete(id);
          }}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-text-secondary transition',
            'hover:bg-error/10 hover:text-error focus:outline-none focus:ring-1 focus:ring-error',
          )}
        >
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
