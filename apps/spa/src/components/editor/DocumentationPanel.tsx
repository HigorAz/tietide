import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCheck, ClipboardCopy, FileText, X } from 'lucide-react';
import { useDocumentationStore } from '@/stores/documentationStore';
import { useToastStore } from '@/stores/toastStore';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { Markdown } from './markdown';

interface DocumentationPanelProps {
  workflowId: string;
}

const COPY_FEEDBACK_MS = 2000;

export function DocumentationPanel({ workflowId }: DocumentationPanelProps) {
  const status = useDocumentationStore((s) => s.status);
  const docs = useDocumentationStore((s) => s.docs);
  const error = useDocumentationStore((s) => s.error);
  const fetch = useDocumentationStore((s) => s.fetch);
  const regenerate = useDocumentationStore((s) => s.regenerate);
  const reset = useDocumentationStore((s) => s.reset);
  const toast = useToastStore((s) => s.show);

  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const regenerateRequestedRef = useRef(false);
  const previousStatusRef = useRef<typeof status | null>(null);

  useEffect(() => {
    void fetch(workflowId);
  }, [fetch, workflowId]);

  useEffect(() => {
    if (status === 'ready' || status === 'error' || status === 'loading') {
      setOpen(true);
    }
  }, [status]);

  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;
    if (previous === null) return;
    if (!regenerateRequestedRef.current) return;
    if (status === 'ready' && previous !== 'ready') {
      toast({ tone: 'success', message: 'Documentation generated' });
      regenerateRequestedRef.current = false;
    } else if (status === 'error' && previous !== 'error') {
      toast({ tone: 'error', message: error ?? 'Failed to generate documentation' });
      regenerateRequestedRef.current = false;
    }
  }, [status, error, toast]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const handleRegenerate = useCallback(() => {
    if (status === 'loading') return;
    setCopied(false);
    regenerateRequestedRef.current = true;
    void regenerate(workflowId);
  }, [regenerate, status, workflowId]);

  const handleCopy = useCallback(async () => {
    if (!docs) return;
    try {
      await navigator.clipboard.writeText(docs.documentation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  }, [docs]);

  const handleClose = useCallback(() => {
    setOpen(false);
    reset();
    setCopied(false);
  }, [reset]);

  const isLoading = status === 'loading';

  return (
    <>
      <button
        type="button"
        onClick={handleRegenerate}
        disabled={isLoading}
        className={cn(
          'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium',
          'transition focus:outline-none focus:ring-1 focus:ring-accent-teal',
          'text-text-primary hover:bg-elevated',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        {isLoading ? <Spinner size="sm" label="Generating" /> : <FileText size={16} aria-hidden />}
        <span>{isLoading ? 'Generating…' : 'Generate Documentation'}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Workflow documentation"
          className="absolute inset-x-2 top-14 z-20 flex max-h-[70vh] w-auto max-w-none flex-col gap-3 rounded-md border border-white/10 bg-surface p-4 shadow-xl shadow-black/40 md:inset-x-auto md:right-4 md:top-16 md:max-h-none md:w-[28rem]"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Documentation</h2>
            <div className="flex items-center gap-2">
              {docs ? (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-elevated"
                  aria-label="Copy documentation"
                >
                  {copied ? (
                    <>
                      <ClipboardCheck size={14} aria-hidden />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <ClipboardCopy size={14} aria-hidden />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleClose}
                className="rounded p-1 text-text-secondary hover:bg-elevated"
                aria-label="Close documentation panel"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {status === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Spinner size="sm" />
                <span>Generating documentation…</span>
              </div>
            )}

            {status === 'error' && (
              <div
                role="alert"
                className="rounded border border-error/30 bg-error/10 p-3 text-sm text-error"
              >
                <p className="font-medium">Failed to generate documentation</p>
                <p className="mt-1 text-text-secondary">{error}</p>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="mt-2 rounded bg-accent-teal px-2 py-1 text-xs font-medium text-deep-blue hover:bg-accent-teal-hover"
                >
                  Retry
                </button>
              </div>
            )}

            {status === 'ready' && docs && (
              <div className="space-y-4">
                <Markdown source={docs.documentation} />
                <dl className="space-y-2 border-t border-white/10 pt-3 text-sm">
                  {(
                    [
                      ['Objective', docs.sections.objective],
                      ['Triggers', docs.sections.triggers],
                      ['Actions', docs.sections.actions],
                      ['Data flow', docs.sections.dataFlow],
                      ['Decisions', docs.sections.decisions],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-text-primary">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
