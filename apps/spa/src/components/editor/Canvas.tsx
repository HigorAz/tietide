import { useCallback, useState, type DragEvent } from 'react';
import ReactFlow, { Background, Controls, useReactFlow, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import type { NodeType } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { useToastStore } from '@/stores/toastStore';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn } from '@/utils/cn';
import { ClipboardJsonDialog, type ClipboardJsonDialogMode } from './ClipboardJsonDialog';
import { edgeTypes } from './edges';
import { editorTouchProps } from './editorTouchProps';
import { EditorContextMenu } from './EditorContextMenu';
import { InspectorDock } from './InspectorDock';
import { nodeTypes } from './nodes';
import { NODE_LIBRARY_DRAG_MIME } from './NodeLibrary';
import { useCanvasClipboard } from './useCanvasClipboard';

const FIT_VIEW_OPTIONS = { padding: 1.2, minZoom: 0.5, maxZoom: 0.85 } as const;

export const CANVAS_DROP_MIME = NODE_LIBRARY_DRAG_MIME;

interface MenuState {
  open: boolean;
  x: number;
  y: number;
}

interface DialogState {
  open: boolean;
  mode: ClipboardJsonDialogMode;
  json: string;
}

const CLOSED_MENU: MenuState = { open: false, x: 0, y: 0 };
const CLOSED_DIALOG: DialogState = { open: false, mode: 'copy', json: '' };

export function Canvas() {
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const onNodesChange = useEditorStore((s) => s.onNodesChange);
  const onEdgesChange = useEditorStore((s) => s.onEdgesChange);
  const onConnect = useEditorStore((s) => s.onConnect);
  const addNode = useEditorStore((s) => s.addNode);
  const selectNode = useEditorStore((s) => s.selectNode);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const showToast = useToastStore((s) => s.show);
  const { screenToFlowPosition } = useReactFlow();
  const isMobile = useIsMobile();

  const { runCopy, runPaste, applyPasteText, buildSelectedJson } = useCanvasClipboard();

  const [isDragActive, setIsDragActive] = useState(false);
  const [menu, setMenu] = useState<MenuState>(CLOSED_MENU);
  const [dialog, setDialog] = useState<DialogState>(CLOSED_DIALOG);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(CANVAS_DROP_MIME)) return;
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    // Ignore bubbling from child elements: only deactivate when the cursor
    // actually leaves the dropzone.
    const related = event.relatedTarget as globalThis.Node | null;
    if (related && event.currentTarget.contains(related)) return;
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      const nodeType = event.dataTransfer.getData(CANVAS_DROP_MIME);
      if (!nodeType) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const beforeCount = useEditorStore.getState().nodes.length;
      addNode(nodeType as NodeType, position);
      const afterCount = useEditorStore.getState().nodes.length;
      if (afterCount === beforeCount) {
        showToast({ tone: 'error', message: 'Workflows can only have one trigger.' });
      }
    },
    [addNode, screenToFlowPosition, showToast],
  );

  const handlePaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault();
    setMenu({ open: true, x: event.clientX, y: event.clientY });
  }, []);

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, node: Node) => {
      event.preventDefault();
      // If the right-clicked node isn't already in the selection, replace the
      // selection with just that node so Copy operates on it.
      const { nodes: curNodes } = useEditorStore.getState();
      const target = curNodes.find((n) => n.id === node.id);
      if (!target?.selected) {
        useEditorStore.setState({
          nodes: curNodes.map((n) => ({ ...n, selected: n.id === node.id })),
        });
        selectNode(node.id);
      }
      setMenu({ open: true, x: event.clientX, y: event.clientY });
    },
    [selectNode],
  );

  const closeMenu = useCallback(() => setMenu(CLOSED_MENU), []);
  const closeDialog = useCallback(() => setDialog(CLOSED_DIALOG), []);

  const hasSelection = nodes.some((n) => n.selected);

  return (
    <div
      data-testid="canvas-dropzone"
      data-tour="editor-canvas"
      data-drag-active={isDragActive ? 'true' : 'false'}
      className={cn(
        'relative h-full w-full flex-1 bg-deep-blue transition-shadow',
        isDragActive && 'ring-2 ring-inset ring-accent-teal/70',
      )}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        {...editorTouchProps(isMobile)}
      >
        <Background gap={16} color="#1A3050" />
        <Controls />
      </ReactFlow>
      {/* The inspector dock (minimap / run / logs / versions) competes with the
          bottom sheets and add-node button for the limited bottom area on a
          phone, so it is desktop-only. Per-node run I/O remains available in
          the node config panel. */}
      {!isMobile && <InspectorDock />}
      {isDragActive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-lg border-2 border-dashed border-accent-teal/60 bg-accent-teal-muted"
        >
          <span className="rounded-md bg-deep-blue/80 px-3 py-1.5 text-xs font-medium text-accent-teal">
            Drop to add node
          </span>
        </div>
      )}
      {!isDragActive && nodes.length === 0 && (
        <div
          aria-hidden
          data-testid="canvas-empty-hint"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="rounded-md border border-white/5 bg-deep-blue/70 px-4 py-2 text-sm font-medium text-text-secondary shadow-sm">
            {isMobile
              ? 'Tap the + button to add a trigger.'
              : 'Drag a trigger from the Node Library to start.'}
          </span>
        </div>
      )}
      <EditorContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        canCopy={hasSelection}
        canDelete={hasSelection}
        onClose={closeMenu}
        onCopy={() => void runCopy()}
        onPaste={() => void runPaste()}
        onCopyAsJson={() => setDialog({ open: true, mode: 'copy', json: buildSelectedJson() })}
        onPasteFromJson={() => setDialog({ open: true, mode: 'paste', json: '' })}
        onDelete={() => deleteSelected()}
      />
      <ClipboardJsonDialog
        open={dialog.open}
        mode={dialog.mode}
        jsonForCopy={dialog.json}
        onClose={closeDialog}
        onPaste={applyPasteText}
      />
    </div>
  );
}
