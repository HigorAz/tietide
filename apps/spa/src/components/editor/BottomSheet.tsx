import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional test id for the sheet panel. */
  'data-testid'?: string;
}

/**
 * Mobile bottom sheet: a panel that slides up from the bottom of the screen
 * with a dimmed backdrop. Used on touch devices in place of the editor's
 * desktop side panels. Closes on backdrop tap, the close button, and Escape.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  'data-testid': testId,
}: BottomSheetProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end md:hidden">
      <div
        data-testid="bottom-sheet-backdrop"
        aria-hidden
        onClick={onClose}
        className="flex-1 bg-deep-blue/60"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className={cn(
          'flex max-h-[85vh] w-full flex-col rounded-t-2xl border-t border-white/5 bg-surface',
          'shadow-2xl shadow-black/40',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-2">
          <span aria-hidden className="h-1 w-10 rounded-full bg-white/15" />
        </div>
        <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex min-h-11 min-w-11 items-center justify-center rounded text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}

export default BottomSheet;
