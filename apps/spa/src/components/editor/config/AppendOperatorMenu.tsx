import { useEffect, useRef, useState } from 'react';
import { TEMPLATE_OPERATORS, type TemplateOperator } from '@tietide/shared';
import { cn } from '@/utils/cn';

export interface AppendOperatorMenuProps {
  /** Append the chosen chained operator to the pill before the caret (#258). */
  onAppend: (op: TemplateOperator) => void;
}

/**
 * The "ƒx" affordance shown when the caret sits right after a `{{ … }}` pill. Owns its own
 * open/close state (incl. outside-click) so the parent DataPillInput only decides visibility.
 * The operator list comes from the shared TEMPLATE_OPERATORS catalog, keeping the UI and the
 * engine's allowlist in lockstep.
 */
export function AppendOperatorMenu({ onAppend }: AppendOperatorMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (ref.current && target && !ref.current.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="absolute right-1 top-1 z-20">
      <button
        type="button"
        data-testid="append-operator-button"
        title="Append a formula operator"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className={cn(
          'rounded border border-white/10 px-1.5 py-0.5 font-mono text-xs',
          'text-accent-teal hover:bg-accent-teal/15 focus:outline-none',
        )}
      >
        ƒx
      </button>
      {open && (
        <ul
          role="menu"
          data-testid="operator-menu"
          className="absolute right-0 top-full z-30 mt-1 max-h-60 w-40 overflow-y-auto rounded-md border border-white/10 bg-elevated shadow-lg"
        >
          {TEMPLATE_OPERATORS.map((op) => (
            <li
              key={op.name}
              role="menuitem"
              className="cursor-pointer px-3 py-1.5 text-xs text-text-primary hover:bg-accent-teal/15 hover:text-accent-teal"
              onMouseDown={(e) => {
                e.preventDefault();
                onAppend(op);
                setOpen(false);
              }}
            >
              {op.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
