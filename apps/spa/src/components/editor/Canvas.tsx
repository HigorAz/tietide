import { useCallback, useState, type DragEvent } from 'react';
import ReactFlow, { Background, Controls, MiniMap, useReactFlow, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import type { NodeType } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import { edgeTypes } from './edges';
import { nodeTypes } from './nodes';
import { NODE_LIBRARY_DRAG_MIME } from './NodeLibrary';

export const CANVAS_DROP_MIME = NODE_LIBRARY_DRAG_MIME;

export function Canvas() {
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const onNodesChange = useEditorStore((s) => s.onNodesChange);
  const onEdgesChange = useEditorStore((s) => s.onEdgesChange);
  const onConnect = useEditorStore((s) => s.onConnect);
  const addNode = useEditorStore((s) => s.addNode);
  const selectNode = useEditorStore((s) => s.selectNode);
  const { screenToFlowPosition } = useReactFlow();

  const [isDragActive, setIsDragActive] = useState(false);

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

  return (
    <div
      data-testid="canvas-dropzone"
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
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
      >
        <Background gap={16} color="#1A3050" />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
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
    </div>
  );
}
