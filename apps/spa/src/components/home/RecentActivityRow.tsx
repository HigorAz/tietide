import { useNavigate } from 'react-router-dom';
import type { WorkflowExecution } from '@tietide/shared';
import { StatusBadge } from '@/components/executions/StatusBadge';
import { computeDurationMs, formatDuration } from '@/components/executions/duration';
import { formatRelativeTime } from '@/components/dashboard/relativeTime';
import { cn } from '@/utils/cn';

export interface RecentActivityRowProps {
  execution: WorkflowExecution;
  workflowName: string | null;
}

export function RecentActivityRow({
  execution,
  workflowName,
}: RecentActivityRowProps): JSX.Element {
  const navigate = useNavigate();
  const startedSource = execution.startedAt ?? execution.createdAt;
  const startedDate = startedSource instanceof Date ? startedSource : new Date(startedSource);
  const durationMs = computeDurationMs(execution.startedAt, execution.finishedAt);
  const handleOpen = (): void => {
    navigate(`/workflows/${execution.workflowId}?execution=${execution.id}`);
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      aria-label={`Open execution ${execution.id}`}
      className={cn(
        'flex w-full items-center justify-between gap-4 border-t border-white/5 px-4 py-3 text-left transition',
        'first:border-t-0 hover:bg-elevated focus:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <StatusBadge status={execution.status} />
        <span className="truncate text-sm font-medium text-text-primary">
          {workflowName ?? execution.workflowId}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-xs text-text-secondary">
        <span>{formatRelativeTime(startedDate)}</span>
        <span className="tabular-nums">{formatDuration(durationMs)}</span>
      </div>
    </button>
  );
}
