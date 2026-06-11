import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useEditorStore, type EditorViewMode } from '@/stores/editorStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';

/**
 * Global Configure/Result toggle for the editor, rendered inline at the start of
 * the EditorToolbar (beside Undo/Redo). Renders only when an execution is loaded
 * (results exist to show). "Configure" returns the canvas + node panel to a fully
 * editable state; "Result" overlays the loaded run.
 *
 * It is a presentation switch only — both views read the same editorStore and
 * executionLiveStore, so flipping never reloads or loses in-progress edits.
 */
export function EditorViewTabs(): JSX.Element | null {
  const executionId = useExecutionLiveStore((s) => s.executionId);
  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);

  if (executionId === null) return null;

  return (
    <span data-testid="editor-view-tabs" data-tour="editor-view-tabs" className="flex items-center">
      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as EditorViewMode)}>
        <TabsList aria-label="Editor view" className="border-b-0">
          <TabsTrigger value="configure">Configure</TabsTrigger>
          <TabsTrigger value="result">Result</TabsTrigger>
        </TabsList>
      </Tabs>
      <span aria-hidden className="mx-1 h-5 w-px bg-white/10" />
    </span>
  );
}
