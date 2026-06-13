import { useCallback, useEffect, useState } from 'react';
import { FileText, Pencil, RefreshCw } from 'lucide-react';
import { useDocumentationStore } from '@/stores/documentationStore';
import { useEditorStore } from '@/stores/editorStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { Spinner } from '@/components/ui/Spinner';
import { DocumentationModal } from '@/components/documentation/DocumentationModal';

export function InspectorDocumentationPanel(): JSX.Element {
  const workflowId = useEditorStore((s) => s.workflowId);
  const workflowName = useWorkflowsStore(
    (s) => s.workflows.find((w) => w.id === workflowId)?.name ?? 'Workflow',
  );
  const status = useDocumentationStore((s) => s.status);
  const docs = useDocumentationStore((s) => s.docs);
  const error = useDocumentationStore((s) => s.error);
  const fetch = useDocumentationStore((s) => s.fetch);
  const regenerate = useDocumentationStore((s) => s.regenerate);
  const save = useDocumentationStore((s) => s.save);

  const [open, setOpen] = useState(false);

  // Hydrate cached docs the first time this tab is opened.
  useEffect(() => {
    if (!workflowId) return;
    if (status === 'idle' && !docs) {
      void fetch(workflowId);
    }
  }, [workflowId, status, docs, fetch]);

  const handleRegenerate = useCallback(() => {
    if (!workflowId || status === 'loading') return;
    setOpen(true);
    void regenerate(workflowId);
  }, [workflowId, status, regenerate]);

  let panel: JSX.Element;
  if (status === 'loading') {
    panel = (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-text-secondary">
        <Spinner size="sm" />
        <span>Generating documentation… this can take a minute or two.</span>
      </div>
    );
  } else if (status === 'error') {
    panel = (
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
  } else if (status === 'idle' || !docs) {
    panel = (
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
  } else {
    panel = (
      <div
        data-testid="inspector-docs-panel"
        className="flex h-full flex-col items-center justify-center gap-3 px-4 py-6 text-center text-xs text-text-secondary"
      >
        <FileText size={24} className="text-accent-teal" aria-hidden />
        <p>Documentation is ready.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded bg-accent-teal px-2.5 py-1 text-xs font-medium text-deep-blue hover:bg-accent-teal-hover"
        >
          <Pencil size={12} aria-hidden />
          Open documentation
        </button>
      </div>
    );
  }

  return (
    <>
      {panel}
      {open && (
        <DocumentationModal
          workflowName={workflowName}
          status={status}
          docs={docs}
          error={error}
          onRegenerate={() => workflowId && void regenerate(workflowId)}
          onSave={(documentation) => save(workflowId ?? '', documentation)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
