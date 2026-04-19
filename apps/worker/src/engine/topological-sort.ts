import type { WorkflowDefinition } from '@tietide/shared';

export class CircularDependencyError extends Error {
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`);
    this.name = 'CircularDependencyError';
    this.cycle = cycle;
  }
}

/**
 * Topologically orders workflow nodes using Kahn's algorithm.
 *
 * MVP constraints:
 * - Exactly one node must have in-degree zero (the trigger).
 * - Edges must reference only known node ids.
 * - Graph must be acyclic.
 */
export function topologicalSort(definition: WorkflowDefinition): string[] {
  const { nodes, edges } = definition;

  if (nodes.length === 0) {
    throw new Error('Workflow must have at least one node.');
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      const unknown = !nodeIds.has(e.source) ? e.source : e.target;
      throw new Error(`Edge "${e.id}" references unknown node "${unknown}".`);
    }
  }

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }
  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    adjacency.get(e.source)!.push(e.target);
  }

  const roots = nodes.filter((n) => inDegree.get(n.id) === 0);
  if (roots.length === 0) {
    throw new CircularDependencyError(nodes.map((n) => n.id));
  }
  if (roots.length > 1) {
    throw new Error(
      `Workflow must have exactly one trigger node (in-degree 0), found ${roots.length}.`,
    );
  }

  const order: string[] = [];
  const queue: string[] = [roots[0].id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const remaining = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  if (order.length !== nodes.length) {
    const cycle = nodes.filter((n) => (inDegree.get(n.id) ?? 0) > 0).map((n) => n.id);
    throw new CircularDependencyError(cycle);
  }

  return order;
}
