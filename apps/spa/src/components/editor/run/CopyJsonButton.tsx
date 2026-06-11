import { Copy } from 'lucide-react';
import { useCopy } from '@/components/editor/dataviewer/useCopy';
import { safeStringify } from '@/components/editor/dataviewer/valueFormat';

export interface CopyJsonButtonProps {
  value: unknown;
}

/**
 * The copy-full-JSON header affordance shared by every data section (locked
 * decision: Configuration, Input, and Output headers each carry this button on
 * both run surfaces). Copies `JSON.stringify(value, null, 2)` via useCopy so it
 * confirms through the toast, and stops propagation so it never toggles the
 * section it lives in.
 */
export function CopyJsonButton({ value }: CopyJsonButtonProps): JSX.Element {
  const copy = useCopy();
  return (
    <button
      type="button"
      aria-label="Copy JSON"
      onClick={(e) => {
        e.stopPropagation();
        void copy(safeStringify(value), 'JSON');
      }}
      className="rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-accent-teal focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
    >
      <Copy size={12} aria-hidden />
    </button>
  );
}
