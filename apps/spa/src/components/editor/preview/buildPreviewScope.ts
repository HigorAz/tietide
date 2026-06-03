import type { Edge, Node } from 'reactflow';
import { TRIGGER_ALIAS, assignNodeAliases, type WorkflowNode } from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import type { NodeRunState } from '@/stores/executionLiveStore';
import { bfsAncestors } from '@/lib/upstream-schema';
import { NODE_OUTPUT_EXAMPLES } from './nodeOutputExamples';

/**
 * Builds the upstream scope `Record<nodeId, outputData>` that the template
 * resolver consumes when rendering the preview for `selectedNodeId`.
 *
 * For each ancestor:
 *   - live execution output if `liveNodes` has it
 *   - else the hand-curated example payload for that node type
 *   - else omitted (caller's resolveTemplate will surface a clear error)
 *
 * Mirrors the worker's scope-building in WorkflowRunner.resolveInputTemplates
 * (scope[nodeId] = output.data). The live store already strips the NodeOutput
 * envelope and stores `data` directly under `NodeRunState.output`.
 */
export function buildPreviewScope(
  selectedNodeId: string,
  nodes: Node<CustomNodeData>[],
  edges: Edge[],
  liveNodes: Map<string, NodeRunState>,
): Record<string, unknown> {
  const ancestorIds = bfsAncestors(selectedNodeId, edges);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  // Mirror the worker: resolve alias roots so {{trigger.x}} / {{steps.<alias>.x}}
  // preview the same way they execute (legacy {{node-<id>.x}} via the id keys).
  const aliasMap = assignNodeAliases(nodes.map(toAliasInput));
  const scope: Record<string, unknown> = {};
  const steps: Record<string, unknown> = {};
  let hasSteps = false;

  const assign = (ancestorId: string, value: unknown): void => {
    scope[ancestorId] = value;
    const alias = aliasMap.get(ancestorId);
    if (alias === TRIGGER_ALIAS) {
      scope[TRIGGER_ALIAS] = value;
    } else if (alias !== undefined) {
      steps[alias] = value;
      hasSteps = true;
    }
  };

  for (const ancestorId of ancestorIds) {
    const liveOutput = liveNodes.get(ancestorId)?.output;
    if (liveOutput !== undefined && liveOutput !== null) {
      assign(ancestorId, liveOutput);
      continue;
    }
    const node = nodeById.get(ancestorId);
    if (!node) continue;
    const example = NODE_OUTPUT_EXAMPLES[node.data.nodeType];
    if (example !== undefined) {
      assign(ancestorId, example);
    }
  }

  if (hasSteps) scope.steps = steps;
  return scope;
}

// Minimal WorkflowNode projection for assignNodeAliases.
function toAliasInput(n: Node<CustomNodeData>): WorkflowNode {
  return {
    id: n.id,
    type: n.data.nodeType,
    name: n.data.label,
    ...(n.data.alias ? { alias: n.data.alias } : {}),
    position: { x: 0, y: 0 },
    config: {},
  };
}
