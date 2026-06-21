import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  FlaskConical,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { findInvalidReferences } from '@/lib/validate-references';
import { useToastStore } from '@/stores/toastStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useDocumentationStore } from '@/stores/documentationStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { executeWorkflow, getExecution, repeatExecution, testWorkflow } from '@/api/executions';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { buildExportPayload, exportFilename, serializeExport } from '@/lib/workflowExport';
import { downloadJson } from '@/lib/downloadFile';
import { DocumentationModal } from '@/components/documentation/DocumentationModal';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { EditorViewTabs } from './EditorViewTabs';
import { InteractionModeToggle } from './InteractionModeToggle';
import { saveWorkflow } from './saveWorkflow';
import { toWorkflowDefinition } from './serialization';

interface EditorToolbarProps {
  workflowId: string;
  entryRoute: string;
}

export function EditorToolbar({ workflowId, entryRoute }: EditorToolbarProps) {
  const isDirty = useEditorStore((s) => s.isDirty);
  const nodeCount = useEditorStore((s) => s.nodes.length);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const selectNode = useEditorStore((s) => s.selectNode);
  const docStatus = useDocumentationStore((s) => s.status);
  const docs = useDocumentationStore((s) => s.docs);
  const docError = useDocumentationStore((s) => s.error);
  const regenerateDocs = useDocumentationStore((s) => s.regenerate);
  const fetchDocs = useDocumentationStore((s) => s.fetch);
  const saveDocs = useDocumentationStore((s) => s.save);
  const workflowName = useWorkflowsStore(
    (s) => s.workflows.find((w) => w.id === workflowId)?.name ?? 'Workflow',
  );
  const toast = useToastStore((s) => s.show);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [, setSearchParams] = useSearchParams();

  // Result-view-only "Repeat run": repeats the currently-loaded execution,
  // reusing the same source (repeatExecution) as the History page button.
  const viewMode = useEditorStore((s) => s.viewMode);
  const loadedExecutionId = useExecutionLiveStore((s) => s.executionId);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);
  const [loadedIsDryRun, setLoadedIsDryRun] = useState<boolean | null>(null);

  // The live store carries only per-node steps, not the run's isDryRun — fetch it
  // so the button can disable for a Test run (parity with the History button).
  useEffect(() => {
    if (!loadedExecutionId) {
      setLoadedIsDryRun(null);
      return;
    }
    let cancelled = false;
    // Defensive: never let a misbehaving call crash the editor render.
    const pending = getExecution(loadedExecutionId) as ReturnType<typeof getExecution> | undefined;
    if (pending && typeof pending.then === 'function') {
      pending
        .then((exec) => {
          if (!cancelled) setLoadedIsDryRun(exec.isDryRun === true);
        })
        .catch(() => {
          if (!cancelled) setLoadedIsDryRun(null);
        });
    } else {
      setLoadedIsDryRun(null);
    }
    return () => {
      cancelled = true;
    };
  }, [loadedExecutionId]);

  const handleRepeatRun = useCallback(async () => {
    if (!loadedExecutionId) return;
    setRepeatingId(loadedExecutionId);
    try {
      await repeatExecution(workflowId, loadedExecutionId);
      toast({ tone: 'success', message: 'Repeat run queued — check History for its result.' });
    } catch {
      toast({ tone: 'error', message: 'Could not start the repeat run.' });
    } finally {
      setRepeatingId(null);
    }
  }, [loadedExecutionId, workflowId, toast]);

  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await saveWorkflow(workflowId);
      toast({ tone: 'success', message: 'Workflow saved' });
    } catch {
      toast({ tone: 'error', message: 'Save failed. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, toast, workflowId]);

  const handleRun = useCallback(async () => {
    if (isRunning || isSaving) return;
    setIsRunning(true);
    // Run executes the *saved* workflow and never auto-saves. When the canvas
    // has unsaved edits we warn that they weren't included (use Test for the
    // draft, or Save first).
    const wasDirty = useEditorStore.getState().isDirty;
    try {
      const execution = await executeWorkflow(workflowId);
      if (wasDirty) {
        toast({
          tone: 'warning',
          message:
            'Ran the last saved version — unsaved edits weren’t included. Save, or use Test to run your draft.',
        });
      } else {
        toast({ tone: 'success', message: 'Execution started' });
      }
      setSearchParams({ execution: execution.id });
    } catch {
      toast({ tone: 'error', message: 'Failed to start execution. Please try again.' });
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, isSaving, setSearchParams, toast, workflowId]);

  const handleExport = useCallback(() => {
    const { nodes, edges } = useEditorStore.getState();
    const definition = toWorkflowDefinition(nodes, edges);
    const workflow = useWorkflowsStore.getState().workflows.find((w) => w.id === workflowId);
    const name = workflow?.name ?? '';
    const payload = buildExportPayload(name, definition);
    downloadJson(exportFilename(name), serializeExport(payload));
  }, [workflowId]);

  const handleTest = useCallback(async () => {
    if (isTesting || isSaving) return;
    setIsTesting(true);
    try {
      const { nodes, edges } = useEditorStore.getState();
      const definition = toWorkflowDefinition(nodes, edges);
      const execution = await testWorkflow(workflowId, definition);
      toast({ tone: 'success', message: 'Test started' });
      setSearchParams({ execution: execution.id });
    } catch {
      toast({ tone: 'error', message: 'Test failed. Please try again.' });
    } finally {
      setIsTesting(false);
    }
  }, [isSaving, isTesting, setSearchParams, toast, workflowId]);

  const handleDocs = useCallback(() => {
    setDocsOpen(true);
    // Lazily hydrate the cached doc; the modal's Regenerate button handles the
    // slow AI path. Never auto-regenerate just from opening.
    const s = useDocumentationStore.getState();
    if (s.status === 'idle' && !s.docs) {
      void fetchDocs(workflowId);
    }
  }, [fetchDocs, workflowId]);

  // Block save/run/test while any data pill points at a deleted/invalid node —
  // the red pills must be fixed first (referential integrity). Pass live run output
  // so validation matches the picker (live output beats a possibly-stale sample).
  const liveNodes = useExecutionLiveStore((s) => s.nodes);
  const invalidRefs = useMemo(
    () => findInvalidReferences(nodes, edges, liveNodes),
    [nodes, edges, liveNodes],
  );
  const invalidCount = invalidRefs.length;
  const hasInvalid = invalidCount > 0;
  const firstBrokenNodeId = invalidRefs[0]?.nodeId;
  const invalidMessage = `${invalidCount} data-pill reference${invalidCount > 1 ? 's' : ''} point to a deleted/invalid node — click to jump to the first red node, then fix the red pills to save or run.`;

  const saveDisabled = !isDirty || isSaving || hasInvalid;
  const runDisabled = isRunning || isSaving || hasInvalid;
  const testDisabled = isTesting || isSaving || nodeCount === 0 || hasInvalid;
  const exportDisabled = nodeCount === 0;
  const undoDisabled = past.length === 0;
  const redoDisabled = future.length === 0;

  return (
    // One wrapping row: Back on the left, controls on the right. On narrow /
    // split-view widths the controls bar wraps to the next line (below Back)
    // instead of overflowing the canvas or overlapping Back. pointer-events-none
    // here keeps the canvas interactive in the gap; each pill re-enables them.
    <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex flex-wrap items-start justify-between gap-2">
      <div
        data-testid="editor-toolbar-back"
        className={cn(
          'pointer-events-auto flex items-center',
          'rounded-md border border-white/5 bg-surface/95 px-2 py-1.5 shadow-lg shadow-black/20 backdrop-blur',
        )}
      >
        <ToolbarButton
          label="Back"
          onClick={() => navigate(entryRoute)}
          icon={<ArrowLeft size={16} aria-hidden />}
        />
      </div>
      <div
        data-testid="editor-toolbar"
        className={cn(
          'pointer-events-auto flex flex-wrap items-center justify-end gap-2',
          'rounded-md border border-white/5 bg-surface/95 px-2 py-1.5 shadow-lg shadow-black/20 backdrop-blur',
        )}
      >
        <EditorViewTabs />
        {hasInvalid && (
          <button
            type="button"
            data-testid="invalid-refs-warning"
            title={invalidMessage}
            onClick={() => {
              if (firstBrokenNodeId) selectNode(firstBrokenNodeId);
            }}
            className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/25 focus:outline-none focus:ring-1 focus:ring-red-400"
          >
            <AlertTriangle size={14} aria-hidden />
            <span className="sr-only sm:not-sr-only">
              {invalidCount} broken pill{invalidCount > 1 ? 's' : ''}
            </span>
          </button>
        )}
        <ToolbarButton
          label="Undo"
          onClick={undo}
          disabled={undoDisabled}
          icon={<Undo2 size={16} aria-hidden />}
        />
        <ToolbarButton
          label="Redo"
          onClick={redo}
          disabled={redoDisabled}
          icon={<Redo2 size={16} aria-hidden />}
        />
        <div aria-hidden className="mx-1 h-5 w-px bg-white/10" />
        {/* Pan/Select canvas mode — meaningless without a mouse, so desktop only. */}
        {!isMobile && <InteractionModeToggle />}
        <ToolbarButton
          label="Export"
          onClick={handleExport}
          disabled={exportDisabled}
          icon={<Download size={16} aria-hidden />}
        />
        <ToolbarButton
          label="AI Docs"
          onClick={handleDocs}
          title="View, edit, and download the AI documentation for this workflow"
          dataTour="editor-docs"
          icon={
            docStatus === 'loading' ? (
              <Spinner size="sm" label="Generating" />
            ) : (
              <span className="relative inline-flex">
                <FileText size={16} aria-hidden />
                <Sparkles
                  size={9}
                  aria-hidden
                  className="absolute -right-1.5 -top-1.5 fill-accent-teal text-accent-teal"
                />
              </span>
            )
          }
        />
        {viewMode === 'result' && loadedExecutionId && (
          <ToolbarButton
            label={repeatingId === loadedExecutionId ? 'Starting…' : 'Repeat run'}
            onClick={() => void handleRepeatRun()}
            disabled={repeatingId === loadedExecutionId || loadedIsDryRun === true}
            title={
              loadedIsDryRun === true
                ? 'Test runs can’t be repeated'
                : 'Re-run this execution with its original trigger data'
            }
            icon={<RotateCcw size={16} aria-hidden />}
          />
        )}
        <ToolbarButton
          label={isRunning ? 'Running…' : 'Run'}
          onClick={handleRun}
          disabled={runDisabled}
          title={hasInvalid ? invalidMessage : 'Runs the last saved version'}
          icon={
            isRunning ? (
              <Spinner size="sm" label="Running" />
            ) : (
              <span className="relative inline-flex">
                <Play size={16} aria-hidden />
                {isDirty && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning"
                  />
                )}
              </span>
            )
          }
          dataTour="editor-run"
        />
        <ToolbarButton
          label={isTesting ? 'Testing…' : 'Test'}
          onClick={handleTest}
          disabled={testDisabled}
          title={hasInvalid ? invalidMessage : 'Runs your current canvas (no save)'}
          icon={
            isTesting ? (
              <Spinner size="sm" label="Testing" />
            ) : (
              <FlaskConical size={16} aria-hidden />
            )
          }
          dataTour="editor-test"
        />
        <ToolbarButton
          label={isSaving ? 'Saving…' : 'Save'}
          onClick={handleSave}
          disabled={saveDisabled}
          primary
          dataTour="editor-save"
          icon={
            isSaving ? (
              <Spinner size="sm" label="Saving" />
            ) : (
              <span className="relative inline-flex">
                <Save size={16} aria-hidden />
                {isDirty && (
                  <span
                    aria-label="Unsaved changes"
                    className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning"
                  />
                )}
              </span>
            )
          }
        />
      </div>

      {docsOpen && (
        <div className="pointer-events-auto">
          <DocumentationModal
            workflowName={workflowName}
            status={docStatus}
            docs={docs}
            error={docError}
            onRegenerate={() => void regenerateDocs(workflowId)}
            onSave={(documentation) => saveDocs(workflowId, documentation)}
            onClose={() => setDocsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
  dataTour?: string;
  title?: string;
}

function ToolbarButton({
  label,
  onClick,
  icon,
  disabled,
  primary,
  dataTour,
  title,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-tour={dataTour}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium sm:py-1',
        'transition focus:outline-none focus:ring-1 focus:ring-accent-teal',
        'disabled:cursor-not-allowed disabled:opacity-40',
        primary
          ? 'bg-accent-teal text-deep-blue hover:bg-accent-teal-hover'
          : 'text-text-primary hover:bg-elevated',
      )}
    >
      {icon}
      {/* Icon-only below `sm` to fit narrow phones; `sr-only` keeps the label in
          the accessibility tree so the button stays named for screen readers.
          `whitespace-nowrap` stops multi-word labels (e.g. "AI Docs") breaking
          mid-text when the toolbar wraps. */}
      <span className="whitespace-nowrap sr-only sm:not-sr-only">{label}</span>
    </button>
  );
}
