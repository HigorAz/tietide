import { Link } from 'react-router-dom';
import type { ConnectionHealth } from '@/api/usage';

export interface ConnectionHealthCardProps {
  items: ConnectionHealth[];
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#12B886',
  EXPIRED: '#F59F00',
  ERROR: '#FF6B6B',
  REVOKED: '#6B7C93',
};

export function ConnectionHealthCard({ items }: ConnectionHealthCardProps): JSX.Element {
  const total = items.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="flex flex-col rounded-lg border border-white/5 bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Connection health</h2>
        <Link
          to="/connections"
          className="text-xs font-medium text-accent-teal transition hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-accent-teal"
        >
          View connections
        </Link>
      </div>
      {total === 0 ? (
        <p className="text-xs text-text-secondary">No connections configured yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => (
            <li key={c.status} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 text-text-secondary">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: STATUS_COLOR[c.status] ?? '#6B7C93' }}
                />
                {c.status}
              </span>
              <span className="tabular-nums text-text-primary">{c.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
