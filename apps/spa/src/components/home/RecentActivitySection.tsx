import { Link } from 'react-router-dom';
import type { WorkflowExecution } from '@tietide/shared';
import type { WorkflowListItem } from '@/api/workflows';
import type { ExecutionsStatus } from '@/stores/executionsStore';
import { RecentActivityRow } from './RecentActivityRow';

export interface RecentActivitySectionProps {
  executions: WorkflowExecution[];
  workflows: WorkflowListItem[];
  status: ExecutionsStatus;
  error: string | null;
}

export function RecentActivitySection({
  executions,
  workflows,
  status,
  error,
}: RecentActivitySectionProps): JSX.Element {
  const nameById = new Map(workflows.map((w) => [w.id, w.name]));
  return (
    <section data-tour="home-recent-activity" aria-label="Recent activity" className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Recent activity
        </h2>
        <Link
          to="/history"
          className="text-xs font-medium text-accent-teal hover:text-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal"
        >
          See all
        </Link>
      </header>

      <div className="overflow-hidden rounded-lg border border-white/5 bg-surface">
        {status === 'loading' && executions.length === 0 && (
          <p className="px-4 py-6 text-sm text-text-secondary">Loading recent activity…</p>
        )}
        {status === 'error' && (
          <p role="alert" className="px-4 py-6 text-sm text-error">
            {error ?? 'Could not load recent activity'}
          </p>
        )}
        {status !== 'loading' && status !== 'error' && executions.length === 0 && (
          <p className="px-4 py-6 text-sm text-text-secondary">
            No executions yet — runs will show up here once your workflows fire.
          </p>
        )}
        {executions.map((exec) => (
          <RecentActivityRow
            key={exec.id}
            execution={exec}
            workflowName={nameById.get(exec.workflowId) ?? null}
          />
        ))}
      </div>
    </section>
  );
}
