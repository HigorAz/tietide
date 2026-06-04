import type { Node } from 'reactflow';
import { assignNodeAliases, type WorkflowNode } from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';

/**
 * Ensure every editor node carries a stable data-pill `alias`. Nodes that
 * already have one keep it (so saved `{{steps.<alias>.x}}` references stay
 * valid); only the missing ones are filled, deduped against the rest via the
 * shared `assignNodeAliases` (the same function the worker uses, so the SPA and
 * engine never disagree on a node's alias). Returns the original array unchanged
 * when nothing is missing (preserves React Flow node identity).
 */
export function ensureNodeAliases(nodes: Node<CustomNodeData>[]): Node<CustomNodeData>[] {
  if (nodes.every((n) => typeof n.data.alias === 'string' && n.data.alias.length > 0)) {
    return nodes;
  }
  const wf: WorkflowNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.data.nodeType,
    name: n.data.label,
    ...(n.data.alias ? { alias: n.data.alias } : {}),
    position: { x: 0, y: 0 },
    config: {},
  }));
  const map = assignNodeAliases(wf);
  return nodes.map((n) =>
    typeof n.data.alias === 'string' && n.data.alias.length > 0
      ? n
      : { ...n, data: { ...n.data, alias: map.get(n.id) } },
  );
}
