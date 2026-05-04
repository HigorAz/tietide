import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { ReactFlowProvider } from 'reactflow';
import { Canvas } from '@/components/editor/Canvas';
import { DocumentationPanel } from '@/components/editor/DocumentationPanel';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { NodeConfigPanel } from '@/components/editor/NodeConfigPanel';
import { NodeLibrary } from '@/components/editor/NodeLibrary';
import { UnsavedChangesModal } from '@/components/editor/UnsavedChangesModal';
import { saveWorkflow } from '@/components/editor/saveWorkflow';
import { useUnsavedChangesGuard } from '@/components/editor/useUnsavedChangesGuard';
import { getWorkflow } from '@/api/workflows';
import { useEditorStore } from '@/stores/editorStore';

type LoadStatus = 'loading' | 'ready' | 'error';

export function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const loadWorkflow = useEditorStore((s) => s.loadWorkflow);
  const resetEditor = useEditorStore((s) => s.resetEditor);
  const isDirty = useEditorStore((s) => s.isDirty);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [fetchKey, setFetchKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const blocker = useUnsavedChangesGuard(isDirty);

  const entryRoute = useMemo(() => {
    const candidate = (location.state as { from?: unknown } | null)?.from;
    return typeof candidate === 'string' && candidate.startsWith('/') ? candidate : '/workflows';
  }, [location.state]);

  useEffect(() => {
    if (!id) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    getWorkflow(id)
      .then((wf) => {
        if (cancelled) return;
        loadWorkflow({ id: wf.id, definition: wf.definition, entryRoute });
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadWorkflow, fetchKey, entryRoute]);

  useEffect(() => {
    return () => {
      resetEditor();
    };
  }, [resetEditor]);

  const handleSaveAndProceed = useCallback(async () => {
    if (!id) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      await saveWorkflow(id);
      blocker.proceed?.();
    } catch {
      setSaveError('Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [id, blocker]);

  const handleDiscard = useCallback(() => {
    blocker.proceed?.();
  }, [blocker]);

  const handleStay = useCallback(() => {
    setSaveError(null);
    blocker.reset?.();
  }, [blocker]);

  if (status === 'loading') {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-secondary">
        <span>Loading workflow…</span>
      </div>
    );
  }

  if (status === 'error' || !id) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <p>Failed to load workflow</p>
        <button
          type="button"
          onClick={() => setFetchKey((k) => k + 1)}
          className="rounded bg-accent-teal px-3 py-1.5 text-xs font-medium text-deep-blue hover:bg-accent-teal-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ReactFlowProvider>
        <NodeLibrary />
        <div className="relative flex-1">
          <Canvas />
          <EditorToolbar workflowId={id} entryRoute={entryRoute} />
          <DocumentationPanel workflowId={id} />
        </div>
        <NodeConfigPanel />
      </ReactFlowProvider>
      <UnsavedChangesModal
        open={blocker.state === 'blocked'}
        onSave={handleSaveAndProceed}
        onDiscard={handleDiscard}
        onStay={handleStay}
        isSaving={isSaving}
        saveError={saveError}
      />
    </div>
  );
}

export default WorkflowEditorPage;
