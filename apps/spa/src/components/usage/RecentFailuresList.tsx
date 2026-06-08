import { Link } from 'react-router-dom';
import type { RecentFailure } from '@/api/usage';

export interface RecentFailuresListProps {
  items: RecentFailure[];
}

const formatWhen = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function RecentFailuresList({ items }: RecentFailuresListProps): JSX.Element {
  return (
    <div className="rounded-lg border border-white/5 bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Recent failures</h2>
      {items.length === 0 ? (
        <p className="text-xs text-text-secondary">No failures in this window. 🎉</p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/5">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/executions/${item.id}`}
                className="flex flex-col gap-0.5 py-2 transition hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-accent-teal"
              >
                <span className="flex items-center justify-between gap-2">
                  <span
                    className="truncate text-sm font-medium text-text-primary"
                    title={item.workflowName}
                  >
                    {item.workflowName}
                  </span>
                  <span className="shrink-0 text-xs text-text-secondary">
                    {formatWhen(item.finishedAt ?? item.createdAt)}
                  </span>
                </span>
                {item.error && (
                  <span className="truncate text-xs text-error" title={item.error}>
                    {item.error}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
