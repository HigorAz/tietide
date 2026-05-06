import { useEffect, useMemo, useState } from 'react';
import ReactFlow, { ReactFlowProvider, type Node } from 'reactflow';
import { create as createDiffPatcher } from 'jsondiffpatch';
import { format as formatHtmlDiff } from 'jsondiffpatch/formatters/html';
import 'jsondiffpatch/formatters/styles/html.css';
import type { WorkflowDefinition } from '@tietide/shared';
import { Modal } from '@/components/dashboard/Modal';
import { useEditorStore } from '@/stores/editorStore';
import { useVersionsStore } from '@/stores/versionsStore';
import { toWorkflowDefinition, fromWorkflowDefinition } from './serialization';
import { diffDefinitions } from './diffDefinitions';
import { nodeTypes } from './nodes';
import type { CustomNodeData } from './nodes/CustomNode.types';

export interface VersionDiffModalProps {
  workflowId: string;
  fromVersion: number;
  onClose: () => void;
}

const diffPatcher = createDiffPatcher({
  // Compare arrays as ordered (no LCS) — fine for our small node/edge lists.
  arrays: { detectMove: false },
});

export function VersionDiffModal({
  workflowId,
  fromVersion,
  onClose,
}: VersionDiffModalProps): JSX.Element {
  const getVersion = useVersionsStore((s) => s.getVersion);
  const liveNodes = useEditorStore((s) => s.nodes);
  const liveEdges = useEditorStore((s) => s.edges);

  const [fromDefinition, setFromDefinition] = useState<WorkflowDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);

  const liveDefinition = useMemo<WorkflowDefinition>(
    () => toWorkflowDefinition(liveNodes, liveEdges),
    [liveNodes, liveEdges],
  );

  useEffect(() => {
    let cancelled = false;
    getVersion(workflowId, fromVersion)
      .then((row) => {
        if (!cancelled) setFromDefinition(row.definition as unknown as WorkflowDefinition);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load version');
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId, fromVersion, getVersion]);

  return (
    <Modal
      onClose={onClose}
      ariaLabel={`Compare version ${fromVersion} with current editor state`}
      className="!max-w-5xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <h2 className="text-base font-semibold text-text-primary">
          Compare v{fromVersion} → current
        </h2>
        <Legend />
      </div>

      {error && <div className="mt-4 text-sm text-red-400">{error}</div>}

      {!fromDefinition && !error && (
        <div className="mt-6 text-center text-sm text-text-secondary">Loading version…</div>
      )}

      {fromDefinition && (
        <div className="mt-4 grid h-[480px] grid-cols-2 gap-3">
          <JsonDiffPane from={fromDefinition} to={liveDefinition} />
          <CanvasDiffPane from={fromDefinition} to={liveDefinition} />
        </div>
      )}
    </Modal>
  );
}

function Legend(): JSX.Element {
  return (
    <div className="flex items-center gap-3 text-xs text-text-secondary">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full bg-accent-teal" /> added
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full bg-red-500/70" /> removed
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" /> modified
      </span>
    </div>
  );
}

function JsonDiffPane({
  from,
  to,
}: {
  from: WorkflowDefinition;
  to: WorkflowDefinition;
}): JSX.Element {
  const html = useMemo(() => {
    const delta = diffPatcher.diff(from, to);
    if (!delta) {
      return '<div class="text-text-secondary text-xs p-2">No JSON differences.</div>';
    }
    return formatHtmlDiff(delta, from) ?? '';
  }, [from, to]);

  return (
    <div
      data-testid="version-diff-json"
      className="overflow-auto rounded border border-white/5 bg-deep-blue/40 p-3 text-xs"
      // jsondiffpatch's HTML formatter produces a deterministic, well-known
      // structure built from JSON.stringify of our own data — no user-controlled
      // HTML strings reach this surface, so dangerouslySetInnerHTML is safe here.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function CanvasDiffPane({
  from,
  to,
}: {
  from: WorkflowDefinition;
  to: WorkflowDefinition;
}): JSX.Element {
  const stateMap = useMemo(() => diffDefinitions(from, to), [from, to]);

  // Render the union of nodes (current + removed) so the user sees what was
  // removed alongside what's still there or new.
  const nodes = useMemo<Node<CustomNodeData>[]>(() => {
    const fromIds = new Set(from.nodes.map((n) => n.id));
    const merged = [...to.nodes];
    for (const fromNode of from.nodes) {
      if (!to.nodes.find((n) => n.id === fromNode.id)) {
        merged.push(fromNode);
      }
    }
    void fromIds; // silence unused-warning while keeping the future hook
    const definition: WorkflowDefinition = { nodes: merged, edges: to.edges };
    const { nodes: rfNodes } = fromWorkflowDefinition(definition);
    return rfNodes.map((n) => {
      const versionState = stateMap.get(n.id);
      if (!versionState) return n;
      return { ...n, data: { ...n.data, versionState } };
    });
  }, [from, to, stateMap]);

  const edges = useMemo(() => {
    const { edges: rfEdges } = fromWorkflowDefinition({ nodes: to.nodes, edges: to.edges });
    return rfEdges;
  }, [to]);

  return (
    <div
      data-testid="version-diff-canvas"
      className="overflow-hidden rounded border border-white/5 bg-deep-blue/40"
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          panOnDrag={false}
          proOptions={{ hideAttribution: true }}
        />
      </ReactFlowProvider>
    </div>
  );
}
