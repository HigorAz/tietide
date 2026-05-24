import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, FlaskConical, Play, Redo2, Save, Undo2 } from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { useToastStore } from '@/stores/toastStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { executeWorkflow, testWorkflow } from '@/api/executions';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { buildExportPayload, exportFilename, serializeExport } from '@/lib/workflowExport';
import { downloadJson } from '@/lib/downloadFile';
import { saveWorkflow } from './saveWorkflow';
import { toWorkflowDefinition } from './serialization';

interface EditorToolbarProps {
  workflowId: string;
  entryRoute: string;
}

export function EditorToolbar({ workflowId, entryRoute }: EditorToolbarProps) {
  const isDirty = useEditorStore((s) => s.isDirty);
  const nodeCount = useEditorStore((s) => s.nodes.length);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const toast = useToastStore((s) => s.show);
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

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
    try {
      if (useEditorStore.getState().isDirty) {
        await saveWorkflow(workflowId);
      }
      const execution = await executeWorkflow(workflowId);
      toast({ tone: 'success', message: 'Execution started' });
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

  const saveDisabled = !isDirty || isSaving;
  const runDisabled = isRunning || isSaving;
  const testDisabled = isTesting || isSaving || nodeCount === 0;
  const exportDisabled = nodeCount === 0;
  const undoDisabled = past.length === 0;
  const redoDisabled = future.length === 0;

  return (
    <>
      <div
        data-testid="editor-toolbar-back"
        className={cn(
          'pointer-events-auto absolute left-4 top-4 z-10 flex items-center',
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
          'pointer-events-auto absolute right-4 top-4 z-10 flex items-center gap-2',
          'rounded-md border border-white/5 bg-surface/95 px-2 py-1.5 shadow-lg shadow-black/20 backdrop-blur',
        )}
      >
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
        <ToolbarButton
          label="Export"
          onClick={handleExport}
          disabled={exportDisabled}
          icon={<Download size={16} aria-hidden />}
        />
        <ToolbarButton
          label={isRunning ? 'Running…' : 'Run'}
          onClick={handleRun}
          disabled={runDisabled}
          icon={isRunning ? <Spinner size="sm" label="Running" /> : <Play size={16} aria-hidden />}
          dataTour="editor-run"
        />
        <ToolbarButton
          label={isTesting ? 'Testing…' : 'Test'}
          onClick={handleTest}
          disabled={testDisabled}
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
    </>
  );
}

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
  dataTour?: string;
}

function ToolbarButton({ label, onClick, icon, disabled, primary, dataTour }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-tour={dataTour}
      // Labels collapse to icon-only below `sm` to fit narrow phones; aria-label
      // keeps the accessible name regardless of the visible-text breakpoint.
      aria-label={label}
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
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
