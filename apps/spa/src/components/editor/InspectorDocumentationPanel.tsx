import { useCallback, useEffect } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { useDocumentationStore } from '@/stores/documentationStore';
import { useEditorStore } from '@/stores/editorStore';
import { Spinner } from '@/components/ui/Spinner';
import { Markdown } from './markdown';

export function InspectorDocumentationPanel(): JSX.Element {
  const workflowId = useEditorStore((s) => s.workflowId);
  const status = useDocumentationStore((s) => s.status);
  const docs = useDocumentationStore((s) => s.docs);
  const error = useDocumentationStore((s) => s.error);
  const fetch = useDocumentationStore((s) => s.fetch);
  const regenerate = useDocumentationStore((s) => s.regenerate);

  // Hydrate cached docs the first time this tab is opened — the floating
  // dialog version of the same store performs the same lazy hydration.
  useEffect(() => {
    if (!workflowId) return;
    if (status === 'idle' && !docs) {
      void fetch(workflowId);
    }
  }, [workflowId, status, docs, fetch]);

  const handleRegenerate = useCallback(() => {
    if (!workflowId || status === 'loading') return;
    void regenerate(workflowId);
  }, [workflowId, status, regenerate]);

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-text-secondary">
        <Spinner size="sm" />
        <span>Generating documentation…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-6 text-center text-xs text-text-secondary">
        <p className="font-medium text-status-failed">Failed to load documentation</p>
        {error ? <p>{error}</p> : null}
        <button
          type="button"
          onClick={handleRegenerate}
          className="mt-2 inline-flex items-center gap-1.5 rounded bg-accent-teal px-2.5 py-1 text-xs font-medium text-deep-blue hover:bg-accent-teal-hover"
        >
          <RefreshCw size={12} aria-hidden />
          Retry
        </button>
      </div>
    );
  }

  if (status === 'idle' || !docs) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-6 text-center text-xs text-text-secondary">
        <FileText size={24} className="text-text-muted" aria-hidden />
        <p>No documentation yet.</p>
        <button
          type="button"
          onClick={handleRegenerate}
          className="mt-1 inline-flex items-center gap-1.5 rounded bg-accent-teal px-2.5 py-1 text-xs font-medium text-deep-blue hover:bg-accent-teal-hover"
        >
          <FileText size={12} aria-hidden />
          Generate documentation
        </button>
      </div>
    );
  }

  return (
    <div data-testid="inspector-docs-panel" className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="text-[11px] uppercase tracking-wide text-text-secondary">
          Workflow documentation
        </span>
        <button
          type="button"
          onClick={handleRegenerate}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-text-secondary hover:bg-white/5 hover:text-accent-teal focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
        >
          <RefreshCw size={11} aria-hidden />
          Regenerate
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 text-xs leading-relaxed text-text-primary">
        <Markdown source={docs.documentation} />
        <dl className="mt-3 space-y-2 border-t border-white/10 pt-3 text-[11px]">
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
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                {label}
              </dt>
              <dd className="mt-0.5 text-text-primary">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
