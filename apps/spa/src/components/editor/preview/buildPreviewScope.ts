import type { Edge, Node } from 'reactflow';
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
  const scope: Record<string, unknown> = {};

  for (const ancestorId of ancestorIds) {
    const liveOutput = liveNodes.get(ancestorId)?.output;
    if (liveOutput !== undefined && liveOutput !== null) {
      scope[ancestorId] = liveOutput;
      continue;
    }
    const node = nodeById.get(ancestorId);
    if (!node) continue;
    const example = NODE_OUTPUT_EXAMPLES[node.data.nodeType];
    if (example !== undefined) {
      scope[ancestorId] = example;
    }
  }

  return scope;
}
