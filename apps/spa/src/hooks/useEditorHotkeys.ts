import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { saveWorkflow } from '@/components/editor/saveWorkflow';
import { toWorkflowDefinition } from '@/components/editor/serialization';
import { executeWorkflow, testWorkflow } from '@/api/executions';
import { useEditorStore } from '@/stores/editorStore';
import { useToastStore } from '@/stores/toastStore';
import { SHORTCUTS_BY_ID } from '@/components/editor/shortcutDefinitions';

export interface UseEditorHotkeysParams {
  workflowId: string;
  onShowCheatsheet: () => void;
}

export function useEditorHotkeys({ workflowId, onShowCheatsheet }: UseEditorHotkeysParams): void {
  const [, setSearchParams] = useSearchParams();
  const toast = useToastStore((s) => s.show);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!useEditorStore.getState().isDirty) return;
    try {
      await saveWorkflow(workflowId);
      toast({ tone: 'success', message: 'Workflow saved' });
    } catch {
      toast({ tone: 'error', message: 'Save failed. Please try again.' });
    }
  }, [toast, workflowId]);

  const handleRun = useCallback(async (): Promise<void> => {
    try {
      if (useEditorStore.getState().isDirty) {
        await saveWorkflow(workflowId);
      }
      const execution = await executeWorkflow(workflowId);
      toast({ tone: 'success', message: 'Execution started' });
      setSearchParams({ execution: execution.id });
    } catch {
      toast({ tone: 'error', message: 'Failed to start execution. Please try again.' });
    }
  }, [setSearchParams, toast, workflowId]);

  const handleTest = useCallback(async (): Promise<void> => {
    const { nodes, edges } = useEditorStore.getState();
    if (nodes.length === 0) return;
    try {
      const definition = toWorkflowDefinition(nodes, edges);
      const execution = await testWorkflow(workflowId, definition);
      toast({ tone: 'success', message: 'Test started' });
      setSearchParams({ execution: execution.id });
    } catch {
      toast({ tone: 'error', message: 'Test failed. Please try again.' });
    }
  }, [setSearchParams, toast, workflowId]);

  useHotkeys(
    SHORTCUTS_BY_ID.save.hotkey as string,
    () => {
      void handleSave();
    },
    { preventDefault: true, enableOnFormTags: false },
    [handleSave],
  );

  useHotkeys(
    SHORTCUTS_BY_ID.undo.hotkey as string,
    () => {
      useEditorStore.getState().undo();
    },
    { preventDefault: true, enableOnFormTags: false },
  );

  useHotkeys(
    SHORTCUTS_BY_ID.redo.hotkey as string,
    () => {
      useEditorStore.getState().redo();
    },
    { preventDefault: true, enableOnFormTags: false },
  );

  useHotkeys(
    SHORTCUTS_BY_ID.delete.hotkey as string,
    () => {
      useEditorStore.getState().deleteSelected();
    },
    { preventDefault: false, enableOnFormTags: false },
  );

  useHotkeys(
    SHORTCUTS_BY_ID.duplicate.hotkey as string,
    () => {
      useEditorStore.getState().duplicateSelected();
    },
    { preventDefault: true, enableOnFormTags: false },
  );

  useHotkeys(
    SHORTCUTS_BY_ID.toggleSkip.hotkey as string,
    () => {
      useEditorStore.getState().toggleSkipOnSelected();
    },
    { preventDefault: true, enableOnFormTags: false },
  );

  useHotkeys(
    SHORTCUTS_BY_ID.run.hotkey as string,
    () => {
      void handleRun();
    },
    { preventDefault: true, enableOnFormTags: false },
    [handleRun],
  );

  useHotkeys(
    SHORTCUTS_BY_ID.test.hotkey as string,
    () => {
      void handleTest();
    },
    { preventDefault: true, enableOnFormTags: false },
    [handleTest],
  );

  useHotkeys(
    SHORTCUTS_BY_ID.cheatsheet.hotkey as string,
    () => {
      onShowCheatsheet();
    },
    { preventDefault: true, enableOnFormTags: false },
    [onShowCheatsheet],
  );
}
