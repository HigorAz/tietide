import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { useReactFlow } from 'reactflow';
import type { NodeType } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { useToastStore } from '@/stores/toastStore';
import { BottomSheet } from './BottomSheet';
import { NodeLibrary } from './NodeLibrary';

/**
 * Touch node-creation UI for the editor. HTML5 drag-and-drop (the desktop way
 * to add nodes) does not work on touch devices, so on mobile a floating "+"
 * button opens the node library as a bottom sheet; tapping a node adds it to
 * the centre of the current viewport and closes the sheet.
 *
 * Must render inside a ReactFlowProvider (it calls useReactFlow). Rendered only
 * on mobile by WorkflowEditorPage.
 */
export function EditorMobileToolbox(): JSX.Element {
  const [open, setOpen] = useState(false);
  const addNode = useEditorStore((s) => s.addNode);
  const showToast = useToastStore((s) => s.show);
  const { screenToFlowPosition } = useReactFlow();

  const handlePick = useCallback(
    (type: NodeType): void => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const before = useEditorStore.getState().nodes.length;
      addNode(type, position);
      const after = useEditorStore.getState().nodes.length;
      if (after === before) {
        showToast({ tone: 'error', message: 'Workflows can only have one trigger.' });
        return;
      }
      setOpen(false);
    },
    [addNode, screenToFlowPosition, showToast],
  );

  return (
    <>
      <button
        type="button"
        data-testid="mobile-add-node-fab"
        onClick={() => setOpen(true)}
        aria-label="Add node"
        className="absolute bottom-4 left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-accent-teal text-deep-blue shadow-lg shadow-black/30 transition hover:bg-accent-teal-hover focus:outline-none focus:ring-2 focus:ring-accent-teal/60"
      >
        <Plus aria-hidden className="h-6 w-6" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Add a node">
        <NodeLibrary onPickNode={handlePick} />
      </BottomSheet>
    </>
  );
}

export default EditorMobileToolbox;
