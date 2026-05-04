import { useNavigate } from 'react-router-dom';
import type { Workflow } from '@tietide/shared';
import { formatRelativeTime } from '@/components/dashboard/relativeTime';
import { cn } from '@/utils/cn';

export interface RecentWorkflowItemProps {
  workflow: Workflow;
}

export function RecentWorkflowItem({ workflow }: RecentWorkflowItemProps): JSX.Element {
  const navigate = useNavigate();
  const handleOpen = (): void => {
    navigate(`/workflows/${workflow.id}`);
  };
  const updated =
    workflow.updatedAt instanceof Date ? workflow.updatedAt : new Date(workflow.updatedAt);

  return (
    <button
      type="button"
      onClick={handleOpen}
      aria-label={`Open ${workflow.name}`}
      className={cn(
        'flex h-full flex-col items-start gap-2 rounded-lg border border-white/5 bg-surface p-4 text-left transition',
        'hover:border-accent-teal/40 hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal',
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span
          data-testid="recent-workflow-name"
          className="truncate text-sm font-semibold text-text-primary"
        >
          {workflow.name}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            workflow.isActive
              ? 'bg-accent-teal/15 text-accent-teal'
              : 'bg-white/5 text-text-secondary',
          )}
        >
          {workflow.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      <p className="text-xs text-text-secondary">Updated {formatRelativeTime(updated)}</p>
    </button>
  );
}
