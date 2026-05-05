import { useCallback, useEffect, useState, type DragEvent } from 'react';
import ReactFlow, { Background, Controls, useReactFlow, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import type { NodeType } from '@tietide/shared';
import {
  buildClipboardPayload,
  ClipboardFormatError,
  parseClipboardPayload,
  serializeClipboardPayload,
} from '@/lib/clipboard';
import { useEditorStore } from '@/stores/editorStore';
import { useToastStore } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { ClipboardJsonDialog, type ClipboardJsonDialogMode } from './ClipboardJsonDialog';
import { edgeTypes } from './edges';
import { EditorContextMenu } from './EditorContextMenu';
import { InspectorDock } from './InspectorDock';
import { nodeTypes } from './nodes';
import { NODE_LIBRARY_DRAG_MIME } from './NodeLibrary';

const FIT_VIEW_OPTIONS = { padding: 0.4, minZoom: 0.5 } as const;
const MULTI_SELECT_KEYS = ['Meta', 'Control', 'Shift'] as const;

export const CANVAS_DROP_MIME = NODE_LIBRARY_DRAG_MIME;

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
};

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
  const pasteFromClipboardPayload = useEditorStore((s) => s.pasteFromClipboardPayload);
  const showToast = useToastStore((s) => s.show);
  const { screenToFlowPosition } = useReactFlow();

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
      addNode(nodeType as NodeType, position);
    },
    [addNode, screenToFlowPosition],
  );

  const buildSelectedJson = useCallback((): string => {
    const { nodes: curNodes, edges: curEdges } = useEditorStore.getState();
    const selected = curNodes.filter((n) => n.selected);
    return serializeClipboardPayload(buildClipboardPayload(selected, curEdges));
  }, []);

  const applyPasteText = useCallback(
    (text: string): string | undefined => {
      try {
        const payload = parseClipboardPayload(text);
        const ids = pasteFromClipboardPayload(payload);
        showToast({
          tone: 'success',
          message: `Pasted ${ids.length} node${ids.length === 1 ? '' : 's'}`,
        });
        return undefined;
      } catch (err) {
        if (err instanceof ClipboardFormatError) return err.message;
        return 'Paste failed.';
      }
    },
    [pasteFromClipboardPayload, showToast],
  );

  const runCopy = useCallback(async (): Promise<void> => {
    const { nodes: curNodes, edges: curEdges } = useEditorStore.getState();
    const selected = curNodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    const payload = buildClipboardPayload(selected, curEdges);
    try {
      await navigator.clipboard.writeText(serializeClipboardPayload(payload));
    } catch {
      showToast({ tone: 'error', message: 'Could not write to clipboard.' });
    }
  }, [showToast]);

  const runPaste = useCallback(async (): Promise<void> => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      showToast({
        tone: 'error',
        message: "Couldn't read clipboard. Use 'Paste from JSON' instead.",
      });
      return;
    }
    const error = applyPasteText(text);
    if (error) showToast({ tone: 'error', message: error });
  }, [applyPasteText, showToast]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'c') {
        event.preventDefault();
        void runCopy();
      } else if (key === 'v') {
        event.preventDefault();
        void runPaste();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [runCopy, runPaste]);

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
        multiSelectionKeyCode={[...MULTI_SELECT_KEYS]}
        panActivationKeyCode="Space"
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
      >
        <Background gap={16} color="#1A3050" />
        <Controls />
      </ReactFlow>
      <InspectorDock />
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
      <EditorContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        canCopy={hasSelection}
        onClose={closeMenu}
        onCopy={() => void runCopy()}
        onPaste={() => void runPaste()}
        onCopyAsJson={() => setDialog({ open: true, mode: 'copy', json: buildSelectedJson() })}
        onPasteFromJson={() => setDialog({ open: true, mode: 'paste', json: '' })}
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
