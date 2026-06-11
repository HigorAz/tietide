import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface ConnectionCardProps {
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
  /** The underlying ConnectionPicker control the card opens onto. */
  children: ReactNode;
  'data-testid'?: string;
}

const titleFor = (name: string | null, optional: boolean, stale: boolean): string => {
  if (stale) return 'Connection unavailable';
  if (name) return name;
  return optional ? 'No authentication' : 'Choose a connection';
};

/**
 * Presentational card for the Connection step. It WRAPS (never replaces) the
 * existing ConnectionPicker: the picker control stays mounted as `children`,
 * the card adds the provider icon, name, status line and a `change ▾` toggle.
 * All text renders through React children — no dangerouslySetInnerHTML (T-02-03).
 */
export function ConnectionCard({
  providerIcon,
  name,
  status,
  optional,
  stale,
  children,
  'data-testid': dataTestId,
}: ConnectionCardProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const title = titleFor(name, optional, stale);
  const isActive = (status ?? '').toUpperCase() === 'ACTIVE';
  const muted = name === null;

  return (
    <div data-testid={dataTestId} className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5 rounded-md border border-white/5 bg-elevated px-3 py-2">
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
        <button
          type="button"
          data-testid="connection-card-change"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            'flex flex-shrink-0 items-center gap-1 text-xs text-text-secondary transition',
            'hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal',
          )}
        >
          change
          <ChevronDown aria-hidden size={12} className={cn('transition', open && 'rotate-180')} />
        </button>
      </div>
      {/*
        Keep the picker MOUNTED across collapse (the keepMounted contract — the
        ConnectionPicker registers the Connection step and must not unmount), but
        use `hidden` (display:none) rather than `sr-only` when collapsed. `sr-only`
        only hides visually: the Radix Select trigger stays focusable and is still
        announced, producing a confusing double tab-stop / phantom combobox. `hidden`
        fully removes it from the tab + a11y tree while leaving it mounted (IN-05).
      */}
      <div hidden={!open}>{children}</div>
    </div>
  );
}
