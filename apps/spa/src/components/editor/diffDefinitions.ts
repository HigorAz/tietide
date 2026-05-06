import type { WorkflowDefinition, WorkflowNode } from '@tietide/shared';
import type { NodeVersionState } from './nodes/CustomNode.types';

/**
 * Compares two workflow definitions and returns a per-node-id state map:
 *  - 'added'    → present in `to` but not in `from`
 *  - 'removed'  → present in `from` but not in `to`
 *  - 'modified' → present in both, but type/name/config/position/skipped differ
 *
 * Untouched nodes are absent from the map.
 */
export function diffDefinitions(
  from: WorkflowDefinition,
  to: WorkflowDefinition,
): Map<string, NodeVersionState> {
  const result = new Map<string, NodeVersionState>();
  const fromById = new Map<string, WorkflowNode>(from.nodes.map((n) => [n.id, n]));
  const toById = new Map<string, WorkflowNode>(to.nodes.map((n) => [n.id, n]));

  for (const [id, toNode] of toById) {
    const fromNode = fromById.get(id);
    if (!fromNode) {
      result.set(id, 'added');
    } else if (!nodesEqual(fromNode, toNode)) {
      result.set(id, 'modified');
    }
  }

  for (const id of fromById.keys()) {
    if (!toById.has(id)) {
      result.set(id, 'removed');
    }
  }

  return result;
}

function nodesEqual(a: WorkflowNode, b: WorkflowNode): boolean {
  if (a.type !== b.type) return false;
  if (a.name !== b.name) return false;
  if (a.position.x !== b.position.x || a.position.y !== b.position.y) return false;
  if ((a.skipped ?? false) !== (b.skipped ?? false)) return false;
  return JSON.stringify(a.config ?? {}) === JSON.stringify(b.config ?? {});
}
