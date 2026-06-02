import type { WorkflowDefinition } from '@tietide/shared';

/**
 * Build the minimal executable subgraph needed to test a single node: the target
 * node plus its transitive ancestors and only the edges among them. Downstream
 * nodes are excluded so nothing past the target runs.
 *
 * The real trigger sits at the root of the ancestor chain (so triggerData flows
 * in and `{{nodeId.field}}` templates resolve against real upstream output); a
 * target with no ancestors becomes a lone root that receives triggerData
 * directly. Used as a `definitionOverride` for a node-test execution.
 *
 * @throws if `nodeId` is not present in the definition.
 */
export function buildSingleNodeDefinition(
  definition: WorkflowDefinition,
  nodeId: string,
): WorkflowDefinition {
  if (!definition.nodes.some((n) => n.id === nodeId)) {
    throw new Error(`Node "${nodeId}" not found in workflow definition`);
  }

  // Reverse-BFS over edges to collect the target and every ancestor.
  const keep = new Set<string>([nodeId]);
  const queue: string[] = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of definition.edges) {
      if (e.target === current && !keep.has(e.source)) {
        keep.add(e.source);
        queue.push(e.source);
      }
    }
  }

  return {
    nodes: definition.nodes.filter((n) => keep.has(n.id)),
    edges: definition.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}
