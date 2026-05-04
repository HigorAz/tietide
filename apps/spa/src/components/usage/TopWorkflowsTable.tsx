import type { KeyboardEvent } from 'react';
import { cn } from '@/utils/cn';
import type { TopWorkflow } from '@/api/usage';

export interface TopWorkflowsTableProps {
  rows: TopWorkflow[];
  onRowClick: (id: string) => void;
}

const formatPercent = (n: number): string => `${Math.round(n * 100)}%`;

export function TopWorkflowsTable({ rows, onRowClick }: TopWorkflowsTableProps): JSX.Element {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-white/5 bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Top workflows</h2>
        <p className="text-sm text-text-secondary">No workflow runs in this window yet.</p>
      </div>
    );
  }

  const handleKey = (e: KeyboardEvent<HTMLTableRowElement>, id: string): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick(id);
    }
  };

  return (
    <div className="rounded-lg border border-white/5 bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Top workflows</h2>
      <table className="w-full table-auto text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-text-secondary">
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium">Runs</th>
            <th className="py-2 font-medium">Success rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              role="button"
              tabIndex={0}
              aria-label={`Open ${row.name}`}
              onClick={() => onRowClick(row.id)}
              onKeyDown={(e) => handleKey(e, row.id)}
              className={cn(
                'cursor-pointer border-t border-white/5 transition',
                'hover:bg-elevated focus:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal',
              )}
            >
              <td className="truncate py-2 pr-4 text-text-primary" title={row.name}>
                {row.name}
              </td>
              <td className="py-2 pr-4 tabular-nums text-text-primary">{row.runs}</td>
              <td className="py-2 tabular-nums text-text-primary">
                {formatPercent(row.successRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
