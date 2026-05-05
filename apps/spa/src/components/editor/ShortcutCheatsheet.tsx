import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';
import { SHORTCUT_CATEGORIES, shortcutsByCategory } from './shortcutDefinitions';

export interface ShortcutCheatsheetProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutCheatsheet({ open, onClose }: ShortcutCheatsheetProps) {
  if (!open) return null;
  const grouped = shortcutsByCategory();
  const titleId = 'shortcut-cheatsheet-title';

  return (
    <Modal onClose={onClose} titleId={titleId} className="max-w-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-text-primary">
            Keyboard shortcuts
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Press <kbd className="rounded bg-elevated px-1 py-0.5 font-mono text-[10px]">?</kbd>{' '}
            anywhere in the editor to reopen this sheet.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close shortcuts"
          className={cn(
            'rounded px-2 py-1 text-xs font-medium text-text-secondary',
            'hover:bg-elevated hover:text-text-primary',
            'focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        >
          Close
        </button>
      </div>

      <div className="mt-5 grid gap-5">
        {SHORTCUT_CATEGORIES.map((category) => {
          const items = grouped[category];
          if (items.length === 0) return null;
          return (
            <section key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {category}
              </h3>
              <ul className="divide-y divide-white/5 rounded-md border border-white/5 bg-deep-blue/40">
                {items.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
                  >
                    <span className="text-text-primary">{s.description}</span>
                    <kbd className="rounded bg-elevated px-2 py-1 font-mono text-[11px] text-accent-teal">
                      {s.displayKeys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
