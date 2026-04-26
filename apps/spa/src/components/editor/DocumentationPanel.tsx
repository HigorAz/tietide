import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, ClipboardCopy, FileText, Loader2, X } from 'lucide-react';
import { useDocumentationStore } from '@/stores/documentationStore';
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
  const generate = useDocumentationStore((s) => s.generate);
  const reset = useDocumentationStore((s) => s.reset);

  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status === 'ready' || status === 'error' || status === 'loading') {
      setOpen(true);
    }
  }, [status]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const handleGenerate = useCallback(() => {
    if (status === 'loading') return;
    setCopied(false);
    void generate(workflowId);
  }, [generate, status, workflowId]);

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
        onClick={handleGenerate}
        disabled={isLoading}
        className={cn(
          'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium',
          'transition focus:outline-none focus:ring-1 focus:ring-accent-teal',
          'text-text-primary hover:bg-elevated',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        {isLoading ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : (
          <FileText size={16} aria-hidden />
        )}
        <span>{isLoading ? 'Generating…' : 'Generate Documentation'}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Workflow documentation"
          className="absolute right-4 top-16 z-20 flex w-[28rem] max-w-[calc(100%-2rem)] flex-col gap-3 rounded-md border border-white/10 bg-surface p-4 shadow-xl shadow-black/40"
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
                <Loader2 size={16} className="animate-spin" aria-hidden />
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
                  onClick={handleGenerate}
                  className="mt-2 rounded bg-accent-teal px-2 py-1 text-xs font-medium text-deep-blue hover:bg-accent-teal-hover"
                >
                  Retry
                </button>
              </div>
            )}

            {status === 'ready' && docs && (
              <div className="space-y-4">
                {docs.cached && (
                  <p className="text-xs text-text-secondary">
                    Served from cache (workflow unchanged).
                  </p>
                )}
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
