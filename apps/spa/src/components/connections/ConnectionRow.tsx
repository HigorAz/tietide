import { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import type { ConnectionView } from '@/api/connections';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { getProviderIcon, getProviderLabel } from './providerCatalog';

export interface ConnectionRowProps {
  connection: ConnectionView;
  isTesting: boolean;
  isDeleting: boolean;
  onTest: (id: string) => void;
  onRevoke: (connection: ConnectionView) => void;
}

const formatRelative = (iso: string | null): string => {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

export function ConnectionRow({
  connection,
  isTesting,
  isDeleting,
  onTest,
  onRevoke,
}: ConnectionRowProps): JSX.Element {
  const [iconError, setIconError] = useState(false);
  const iconUrl = getProviderIcon(connection.provider);
  const providerLabel = getProviderLabel(connection.provider);

  return (
    <li
      className={cn(
        'flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-surface p-4',
        isDeleting && 'opacity-50',
      )}
      data-testid={`connection-row-${connection.id}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {iconUrl && !iconError ? (
          <img
            src={iconUrl}
            alt={`${providerLabel} logo`}
            className="h-10 w-10 flex-shrink-0 rounded-md"
            onError={() => setIconError(true)}
          />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-elevated text-sm font-semibold text-text-secondary">
            {providerLabel.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-text-primary">{connection.name}</p>
            <ConnectionStatusBadge status={connection.status} />
          </div>
          <p className="mt-0.5 truncate text-xs text-text-secondary">
            {providerLabel} · last used {formatRelative(connection.lastUsedAt)}
          </p>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onTest(connection.id)}
          disabled={isTesting || isDeleting}
          className={cn(
            'inline-flex items-center gap-2 rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-text-primary transition',
            'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isTesting && <Spinner size="sm" label="Testing" />}
          <span>{isTesting ? 'Testing…' : 'Test'}</span>
        </button>
        <button
          type="button"
          onClick={() => onRevoke(connection)}
          disabled={isDeleting}
          className={cn(
            'rounded-md border border-error/30 px-2.5 py-1 text-xs font-medium text-error transition',
            'hover:bg-error/10 focus:outline-none focus:ring-1 focus:ring-error',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          Revoke
        </button>
      </div>
    </li>
  );
}
