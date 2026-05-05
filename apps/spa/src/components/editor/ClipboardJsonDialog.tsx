import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

export type ClipboardJsonDialogMode = 'copy' | 'paste';

export interface ClipboardJsonDialogProps {
  open: boolean;
  mode: ClipboardJsonDialogMode;
  jsonForCopy: string;
  onClose: () => void;
  // In paste mode: returns an error message to display, or void on success.
  onPaste: (text: string) => string | void;
}

export function ClipboardJsonDialog({
  open,
  mode,
  jsonForCopy,
  onClose,
  onPaste,
}: ClipboardJsonDialogProps): React.ReactElement | null {
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPasteText('');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const title = mode === 'copy' ? 'Copy nodes as JSON' : 'Paste nodes from JSON';
  const isPaste = mode === 'paste';

  const handlePasteSubmit = (): void => {
    const result = onPaste(pasteText);
    if (typeof result === 'string') {
      setError(result);
      return;
    }
    onClose();
  };

  const handleCopyToClipboard = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(jsonForCopy);
    } catch {
      // best-effort; user can still select-all + copy manually
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-xl rounded-lg border border-white/10 bg-slate-900 p-5 shadow-2xl">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss dialog"
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-100"
          >
            <X size={16} />
          </button>
        </header>

        <textarea
          value={isPaste ? pasteText : jsonForCopy}
          readOnly={!isPaste}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder={isPaste ? 'Paste TieTide clipboard JSON here...' : undefined}
          spellCheck={false}
          className={cn(
            'h-48 w-full resize-none rounded border border-white/10 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100',
            'focus:border-accent-teal focus:outline-none',
          )}
        />

        {error && (
          <p className="mt-2 text-xs text-red-400" role="alert">
            {error}
          </p>
        )}

        <footer className="mt-4 flex justify-end gap-2">
          {isPaste ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePasteSubmit}
                disabled={pasteText.length === 0}
                className={cn(
                  'rounded bg-accent-teal/20 px-3 py-1.5 text-xs font-medium text-accent-teal',
                  'hover:bg-accent-teal/30 disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                Paste &amp; Insert
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleCopyToClipboard()}
                className="rounded bg-accent-teal/20 px-3 py-1.5 text-xs font-medium text-accent-teal hover:bg-accent-teal/30"
              >
                Copy to clipboard
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
              >
                Close
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
