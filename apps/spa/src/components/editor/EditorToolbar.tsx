import { useCallback, useState } from 'react';
import { Play, Redo2, Save, Undo2 } from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { updateWorkflow } from '@/api/workflows';
import { cn } from '@/utils/cn';
import { toWorkflowDefinition } from './serialization';

interface EditorToolbarProps {
  workflowId: string;
}

type SaveFeedback = { tone: 'success' | 'error'; message: string } | null;

const RUN_PLACEHOLDER_MESSAGE = 'Run coming soon';
const FEEDBACK_TIMEOUT_MS = 3000;

export function EditorToolbar({ workflowId }: EditorToolbarProps) {
  const isDirty = useEditorStore((s) => s.isDirty);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const markSaved = useEditorStore((s) => s.markSaved);

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback>(null);

  const showFeedback = useCallback((next: SaveFeedback) => {
    setFeedback(next);
    if (next) {
      window.setTimeout(() => setFeedback(null), FEEDBACK_TIMEOUT_MS);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    const { nodes, edges } = useEditorStore.getState();
    setIsSaving(true);
    try {
      const saved = await updateWorkflow(workflowId, {
        definition: toWorkflowDefinition(nodes, edges),
      });
      useWorkflowsStore.getState().upsert(saved);
      markSaved();
      showFeedback({ tone: 'success', message: 'Saved' });
    } catch {
      showFeedback({ tone: 'error', message: 'Save failed' });
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, markSaved, showFeedback, workflowId]);

  const handleRun = useCallback(() => {
    showFeedback({ tone: 'success', message: RUN_PLACEHOLDER_MESSAGE });
  }, [showFeedback]);

  const saveDisabled = !isDirty || isSaving;
  const undoDisabled = past.length === 0;
  const redoDisabled = future.length === 0;

  return (
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
      <ToolbarButton label="Run" onClick={handleRun} icon={<Play size={16} aria-hidden />} />
      <ToolbarButton
        label={isSaving ? 'Saving…' : 'Save'}
        onClick={handleSave}
        disabled={saveDisabled}
        primary
        icon={<Save size={16} aria-hidden />}
      />
      {feedback ? (
        <span
          role="status"
          className={cn(
            'ml-1 rounded px-2 py-1 text-xs font-medium',
            feedback.tone === 'success' ? 'bg-success/15 text-success' : 'bg-error/15 text-error',
          )}
        >
          {feedback.message}
        </span>
      ) : null}
    </div>
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
