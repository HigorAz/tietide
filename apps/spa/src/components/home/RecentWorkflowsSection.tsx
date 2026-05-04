import { Link } from 'react-router-dom';
import type { Workflow } from '@tietide/shared';
import { RecentWorkflowItem } from './RecentWorkflowItem';

export interface RecentWorkflowsSectionProps {
  workflows: Workflow[];
}

export function RecentWorkflowsSection({ workflows }: RecentWorkflowsSectionProps): JSX.Element {
  return (
    <section aria-label="Recent workflows" className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Recent workflows
        </h2>
        <Link
          to="/workflows"
          className="text-xs font-medium text-accent-teal hover:text-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal"
        >
          See all
        </Link>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {workflows.map((wf) => (
          <RecentWorkflowItem key={wf.id} workflow={wf} />
        ))}
      </div>
    </section>
  );
}
