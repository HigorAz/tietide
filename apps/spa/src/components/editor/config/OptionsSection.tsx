import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface OptionsSectionProps {
  /** Header title. Defaults to 'Options'. */
  title?: string;
  /** Meta line shown on the right (e.g. '2 options · defaults') — rendered verbatim. */
  meta?: string;
  /** Whether the section starts expanded. Defaults to false (collapsed per REQ-C3). */
  defaultOpen?: boolean;
  children: ReactNode;
  'data-testid'?: string;
}

/**
 * Collapsed sub-section grouping optional/advanced fields, hidden by default.
 * Header shows a title, a verbatim meta line, and a chevron.
 */
export function OptionsSection({
  title = 'Options',
  meta,
  defaultOpen = false,
  children,
  'data-testid': dataTestId,
}: OptionsSectionProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div data-testid={dataTestId}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between rounded-md border border-white/5 bg-elevated px-3 py-2',
          'hover:border-accent-teal/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal',
        )}
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown size={14} aria-hidden className="text-text-muted" />
          ) : (
            <ChevronRight size={14} aria-hidden className="text-text-muted" />
          )}
          <span className="text-xs font-semibold text-text-secondary">{title}</span>
        </span>
        {meta && <span className="text-[10px] text-text-muted">{meta}</span>}
      </button>

      {open && <div className="mt-2 flex flex-col gap-4">{children}</div>}
    </div>
  );
}
