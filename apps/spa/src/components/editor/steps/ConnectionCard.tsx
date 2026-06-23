import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

// Omit the native button `name` attribute — this card's `name` prop is the
// connection's display name, not a form-field name.
export interface ConnectionCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'name'> {
  /** Existing provider-glyph element (e.g. an <img> from the provider catalog). */
  providerIcon: ReactNode;
  /** Selected connection name, or null for the empty/optional state. */
  name: string | null;
  /** ConnectionStatus string of the selected connection, or null. */
  status: string | null;
  /** True when the connection is optional (allowClear). */
  optional: boolean;
  /** True when a saved connectionId no longer resolves. */
  stale: boolean;
}

const titleFor = (name: string | null, optional: boolean, stale: boolean): string => {
  if (stale) return 'Connection unavailable';
  if (name) return name;
  return optional ? 'No authentication' : 'Choose a connection';
};

/**
 * The Connection step's summary row. It IS the dropdown trigger: clicking the
 * card opens the connection picker directly (one click), instead of a redundant
 * "change" toggle that revealed a second, separate dropdown row. Rendered via
 * Radix `Select.Trigger asChild`, so it forwards the ref + trigger props
 * (onClick, aria-expanded, role=combobox, …) it receives.
 */
export const ConnectionCard = forwardRef<HTMLButtonElement, ConnectionCardProps>(
  function ConnectionCard(
    { providerIcon, name, status, optional, stale, className, ...rest },
    ref,
  ): JSX.Element {
    const title = titleFor(name, optional, stale);
    const isActive = (status ?? '').toUpperCase() === 'ACTIVE';
    const muted = name === null;

    return (
      <button
        ref={ref}
        type="button"
        data-testid="connection-card-change"
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md border bg-elevated px-3 py-2 text-left transition',
          'hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-accent-teal',
          'disabled:cursor-not-allowed disabled:opacity-60',
          stale ? 'border-amber-400/40 focus:ring-amber-400' : 'border-white/5',
          className,
        )}
        {...rest}
      >
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center [&>img]:h-5 [&>img]:w-5">
          {providerIcon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              'truncate text-sm font-medium',
              stale ? 'text-amber-200' : muted ? 'text-text-muted' : 'text-text-primary',
            )}
          >
            {title}
          </span>
          {status && (
            <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <span
                aria-hidden
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isActive ? 'bg-status-success' : 'bg-status-failed',
                )}
              />
              {status.toLowerCase()}
            </span>
          )}
        </span>
        <ChevronDown aria-hidden size={14} className="flex-shrink-0 text-text-secondary" />
      </button>
    );
  },
);
