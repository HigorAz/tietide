import { Copy } from 'lucide-react';
import { useCopy } from '../dataviewer/useCopy';
import { RawJson } from '../dataviewer/RawJson';
import { safeStringify } from '../dataviewer/valueFormat';

export interface JsonBlockProps {
  label: string;
  testId: string;
  value: unknown;
}

/**
 * Thin labeled wrapper around the shared RawJson pane, kept during the run-result
 * migration so NodePreviewPanel keeps working unchanged. The raw `<pre>` blob now
 * lives in RawJson (syntax-tinted); JsonBlock only owns the label + copy-full-JSON
 * header, routed through useCopy/toast for confirmation consistency.
 */
export function JsonBlock({ label, testId, value }: JsonBlockProps): JSX.Element {
  const copy = useCopy();

  return (
    <div data-testid={testId} className="space-y-1">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-text-secondary">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => void copy(safeStringify(value), `${label} JSON`)}
          aria-label={`Copy ${label} JSON`}
          className="rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-accent-teal focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
        >
          <Copy size={12} aria-hidden />
        </button>
      </div>
      <RawJson value={value} />
    </div>
  );
}
