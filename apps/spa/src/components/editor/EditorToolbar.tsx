import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Redo2, Save, Undo2 } from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { useToastStore } from '@/stores/toastStore';
import { executeWorkflow } from '@/api/executions';
import { cn } from '@/utils/cn';
import { saveWorkflow } from './saveWorkflow';

interface EditorToolbarProps {
  workflowId: string;
  entryRoute: string;
}

export function EditorToolbar({ workflowId, entryRoute }: EditorToolbarProps) {
  const isDirty = useEditorStore((s) => s.isDirty);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const toast = useToastStore((s) => s.show);
  const navigate = useNavigate();

  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

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
      navigate(`/executions/${execution.id}`);
    } catch {
      toast({ tone: 'error', message: 'Failed to start execution. Please try again.' });
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, isSaving, navigate, toast, workflowId]);

  const saveDisabled = !isDirty || isSaving;
  const runDisabled = isRunning || isSaving;
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
          label={isRunning ? 'Running…' : 'Run'}
          onClick={handleRun}
          disabled={runDisabled}
          icon={<Play size={16} aria-hidden />}
        />
        <ToolbarButton
          label={isSaving ? 'Saving…' : 'Save'}
          onClick={handleSave}
          disabled={saveDisabled}
          primary
          icon={
            <span className="relative inline-flex">
              <Save size={16} aria-hidden />
              {isDirty && (
                <span
                  aria-label="Unsaved changes"
                  className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning"
                />
              )}
            </span>
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
}

function ToolbarButton({ label, onClick, icon, disabled, primary }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium',
        'transition focus:outline-none focus:ring-1 focus:ring-accent-teal',
        'disabled:cursor-not-allowed disabled:opacity-40',
        primary
          ? 'bg-accent-teal text-deep-blue hover:bg-accent-teal-hover'
          : 'text-text-primary hover:bg-elevated',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
