import { formatDuration } from '@/components/executions/duration';
import type { NodeFailure } from '@/api/usage';

export interface NodeFailuresTableProps {
  rows: NodeFailure[];
}

export function NodeFailuresTable({ rows }: NodeFailuresTableProps): JSX.Element {
  return (
    <div className="rounded-lg border border-white/5 bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Top failing nodes</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-text-secondary">No node failures in this window.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-text-secondary">
              <th className="py-1 text-left font-medium">Node type</th>
              <th className="py-1 text-right font-medium">Failures</th>
              <th className="py-1 text-right font-medium">Avg duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.nodeType} className="border-t border-white/5">
                <td className="truncate py-2 text-text-primary" title={row.nodeType}>
                  {row.nodeType}
                </td>
                <td className="py-2 text-right tabular-nums text-text-primary">{row.failures}</td>
                <td className="py-2 text-right tabular-nums text-text-secondary">
                  {formatDuration(row.avgDurationMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
