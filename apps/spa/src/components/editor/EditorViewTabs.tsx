import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useEditorStore, type EditorViewMode } from '@/stores/editorStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { cn } from '@/utils/cn';

/**
 * Global Configure/Result toggle for the editor. Renders only when an execution
 * is loaded (results exist to show). Switching to "Configure" returns the canvas
 * + node panel to a fully editable state; "Result" overlays the loaded run.
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
    <div
      data-testid="editor-view-tabs"
      // React Flow listens for pointer events on the canvas underneath; without
      // this, clicking a tab would start a pan gesture.
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        'pointer-events-auto absolute left-1/2 top-4 z-10 -translate-x-1/2',
        'rounded-md border border-white/5 bg-surface/95 px-1 py-0.5 shadow-lg shadow-black/20 backdrop-blur',
      )}
    >
      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as EditorViewMode)}>
        <TabsList aria-label="Editor view" className="border-b-0">
          <TabsTrigger value="configure">Configure</TabsTrigger>
          <TabsTrigger value="result">Result</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
