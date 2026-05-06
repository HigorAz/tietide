import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ReactFlowProvider } from 'reactflow';
import { Canvas } from '@/components/editor/Canvas';
import { DocumentationPanel } from '@/components/editor/DocumentationPanel';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { NodeConfigPanel } from '@/components/editor/NodeConfigPanel';
import { NodeLibrary } from '@/components/editor/NodeLibrary';
import { ShortcutCheatsheet } from '@/components/editor/ShortcutCheatsheet';
import { UnsavedChangesModal } from '@/components/editor/UnsavedChangesModal';
import { saveWorkflow } from '@/components/editor/saveWorkflow';
import { useUnsavedChangesGuard } from '@/components/editor/useUnsavedChangesGuard';
import { getWorkflow } from '@/api/workflows';
import { getExecution, listExecutionSteps } from '@/api/executions';
import { useEditorHotkeys } from '@/hooks/useEditorHotkeys';
import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { useAuthStore } from '@/stores/authStore';
import { executionSocket } from '@/lib/execution-socket';

type LoadStatus = 'loading' | 'ready' | 'error';

export function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const executionId = searchParams.get('execution');
  const location = useLocation();
  const loadWorkflow = useEditorStore((s) => s.loadWorkflow);
  const resetEditor = useEditorStore((s) => s.resetEditor);
  const isDirty = useEditorStore((s) => s.isDirty);
  const seedExecutionFromSteps = useExecutionLiveStore((s) => s.seedFromSteps);
  const setExecutionStoreId = useExecutionLiveStore((s) => s.setExecutionId);
  const resetExecutionLive = useExecutionLiveStore((s) => s.reset);
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [fetchKey, setFetchKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showCheatsheet, setShowCheatsheet] = useState(false);

  const blocker = useUnsavedChangesGuard(isDirty);

  const handleShowCheatsheet = useCallback(() => setShowCheatsheet(true), []);
  const handleCloseCheatsheet = useCallback(() => setShowCheatsheet(false), []);

  useEditorHotkeys({
    workflowId: id ?? '',
    onShowCheatsheet: handleShowCheatsheet,
  });

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

  // Forward live execution events from the WS singleton into the live store.
  useEffect(() => {
    return executionSocket.onEvent((envelope) => {
      useExecutionLiveStore.getState().applyEvent(envelope);
    });
  }, []);

  // When an `?execution=<id>` is present, seed the live store from the REST
  // steps endpoint and (only if the execution is still in flight) open the WS
  // and subscribe. Terminal executions render as a static replay.
  useEffect(() => {
    if (!executionId) return;
    let cancelled = false;
    resetExecutionLive();
    setExecutionStoreId(executionId);

    (async () => {
      try {
        const [execution, steps] = await Promise.all([
          getExecution(executionId),
          listExecutionSteps(executionId),
        ]);
        if (cancelled) return;
        seedExecutionFromSteps(steps);

        const isLive = execution.status === 'PENDING' || execution.status === 'RUNNING';
        if (isLive && token) {
          executionSocket.connect(token);
          executionSocket.subscribe(executionId);
        }
      } catch {
        // Hydration failed (404, network) — leave the empty state in place.
      }
    })();

    return () => {
      cancelled = true;
      executionSocket.unsubscribe(executionId);
      executionSocket.disconnect();
      resetExecutionLive();
    };
  }, [executionId, token, resetExecutionLive, setExecutionStoreId, seedExecutionFromSteps]);

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
      <ShortcutCheatsheet open={showCheatsheet} onClose={handleCloseCheatsheet} />
    </div>
  );
}

export default WorkflowEditorPage;
