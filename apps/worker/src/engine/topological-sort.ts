import type { WorkflowDefinition } from '@tietide/shared';
import { validateWorkflowTopology } from '@tietide/shared';

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
 * Validation rules (single trigger, no cycles, no dangling edges) are shared
 * with the API save-time check via `validateWorkflowTopology` from
 * `@tietide/shared`. This function only adds ordering on top of a validated
 * graph, and re-throws typed errors so existing engine callers keep their
 * current control flow.
 */
export function topologicalSort(definition: WorkflowDefinition): string[] {
  const { nodes, edges } = definition;

  const issues = validateWorkflowTopology(definition);
  if (issues.length > 0) {
    const issue = issues[0]!;
    if (issue.code === 'cycle' || issue.code === 'no_trigger') {
      // `no_trigger` happens when every node has an incoming edge — that's a
      // cycle covering the whole graph. Surface it as CircularDependencyError
      // for engine callers that branch on the error type.
      if (issue.cycle && issue.cycle.length > 0) {
        throw new CircularDependencyError(issue.cycle);
      }
    }
    throw new Error(issue.message);
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

  const root = nodes.find((n) => inDegree.get(n.id) === 0)!;

  const order: string[] = [];
  const queue: string[] = [root.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const remaining = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  return order;
}
