import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ReactFlowProvider } from 'reactflow';
import { Canvas } from '@/components/editor/Canvas';
import { DocumentationPanel } from '@/components/editor/DocumentationPanel';
import { EditorMobileToolbox } from '@/components/editor/EditorMobileToolbox';
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
import { useIsMobile } from '@/hooks/useMediaQuery';
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
  const setExecutionMode = useExecutionLiveStore((s) => s.setMode);
  const resetExecutionLive = useExecutionLiveStore((s) => s.reset);
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [fetchKey, setFetchKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const isMobile = useIsMobile();

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
  //
  // Polling watchdog: while the execution is in flight, re-fetch every 2.5s
  // and re-seed the store. This guarantees convergence even if the WebSocket
  // never connects (common when the API sits behind a Cloudflare tunnel that
  // doesn't forward `/socket.io/`). Polling stops the moment status becomes
  // terminal or after a 5-minute hard ceiling.
  useEffect(() => {
    if (!executionId) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const startedAt = Date.now();
    const HARD_CEILING_MS = 5 * 60 * 1000;
    const POLL_INTERVAL_MS = 2500;

    resetExecutionLive();
    setExecutionStoreId(executionId);

    const stopPolling = (): void => {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const applyTerminalStatus = (status: string): void => {
      if (status === 'SUCCESS') {
        useExecutionLiveStore.getState().setStatus('success');
      } else if (status === 'FAILED' || status === 'CANCELLED') {
        useExecutionLiveStore.getState().setStatus('error');
      }
    };

    const pollOnce = async (): Promise<void> => {
      try {
        const [execution, steps] = await Promise.all([
          getExecution(executionId),
          listExecutionSteps(executionId),
        ]);
        if (cancelled) return;
        seedExecutionFromSteps(steps);

        const isLive = execution.status === 'PENDING' || execution.status === 'RUNNING';
        if (!isLive) {
          applyTerminalStatus(execution.status);
          setExecutionMode('replay');
          stopPolling();
          return;
        }

        if (Date.now() - startedAt > HARD_CEILING_MS) {
          stopPolling();
        }
      } catch {
        // Network blip / 404 — swallow; next tick may recover.
      }
    };

    (async () => {
      try {
        const [execution, steps] = await Promise.all([
          getExecution(executionId),
          listExecutionSteps(executionId),
        ]);
        if (cancelled) return;
        seedExecutionFromSteps(steps);

        const isLive = execution.status === 'PENDING' || execution.status === 'RUNNING';
        setExecutionMode(isLive ? 'live' : 'replay');

        if (!isLive) {
          applyTerminalStatus(execution.status);
          return;
        }

        if (token) {
          executionSocket.connect(token);
          executionSocket.subscribe(executionId);
        }
        // Even with WS connected, start the polling watchdog so a broken WS
        // pipeline doesn't strand the UI on "running" forever.
        pollTimer = setInterval(() => {
          void pollOnce();
        }, POLL_INTERVAL_MS);
      } catch {
        // Hydration failed (404, network) — leave the empty state in place.
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
      executionSocket.unsubscribe(executionId);
      executionSocket.disconnect();
      resetExecutionLive();
    };
  }, [
    executionId,
    token,
    resetExecutionLive,
    setExecutionStoreId,
    setExecutionMode,
    seedExecutionFromSteps,
  ]);

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
        {/* Desktop: the node library is a left side panel. On mobile it opens
            from the EditorMobileToolbox FAB as a bottom sheet instead, so the
            canvas gets the full width. */}
        {!isMobile && <NodeLibrary />}
        <div className="relative flex-1">
          <Canvas />
          <EditorToolbar workflowId={id} entryRoute={entryRoute} />
          <DocumentationPanel workflowId={id} />
          {isMobile && <EditorMobileToolbox />}
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
