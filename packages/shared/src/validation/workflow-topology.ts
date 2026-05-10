import type { WorkflowDefinition } from '../types/workflow.types.js';

/**
 * Codes that classify a topology violation.
 *
 * - `no_trigger`     — workflow has zero in-degree-0 nodes (every node has an
 *                      incoming edge, or the workflow is empty)
 * - `multiple_triggers` — more than one in-degree-0 node (MVP constraint:
 *                         exactly one entry point)
 * - `dangling_edge`  — an edge references a node id that is not in `nodes`
 * - `cycle`          — the directed graph contains a cycle
 */
export type WorkflowTopologyIssueCode =
  | 'no_trigger'
  | 'multiple_triggers'
  | 'dangling_edge'
  | 'cycle';

export interface WorkflowTopologyIssue {
  code: WorkflowTopologyIssueCode;
  /** Zod-compatible path into the definition (`['nodes']`, `['edges', 2, 'target']`). */
  path: (string | number)[];
  /** Human-readable explanation surfaced in 422 responses. */
  message: string;
  /** For `cycle` issues: the node ids that participate in the cycle. */
  cycle?: string[];
}

/**
 * Pure validator for workflow topology rules enforced at save-time.
 *
 * Returns an empty array when the definition is topologically valid. Never
 * throws — the caller decides whether to reject (API) or rethrow as a typed
 * error (Worker `topologicalSort`).
 *
 * Assumes the definition has already been parsed against
 * `workflowDefinitionSchema` (i.e. nodes have unique ids, edges have source +
 * target strings, etc.). Calling with a malformed definition is safe but the
 * issues array may be less precise.
 */
export function validateWorkflowTopology(definition: WorkflowDefinition): WorkflowTopologyIssue[] {
  const issues: WorkflowTopologyIssue[] = [];
  const { nodes, edges } = definition;

  if (nodes.length === 0) {
    issues.push({
      code: 'no_trigger',
      path: ['nodes'],
      message: 'Workflow must have at least one node.',
    });
    return issues;
  }

  const nodeIds = new Set(nodes.map((n) => n.id));

  // Dangling-edge check: surface every offending edge so the editor can mark
  // them all at once instead of trickling them out one save at a time.
  let hasDangling = false;
  edges.forEach((e, index) => {
    if (!nodeIds.has(e.source)) {
      hasDangling = true;
      issues.push({
        code: 'dangling_edge',
        path: ['edges', index, 'source'],
        message: `Edge "${e.id}" references unknown node "${e.source}".`,
      });
    }
    if (!nodeIds.has(e.target)) {
      hasDangling = true;
      issues.push({
        code: 'dangling_edge',
        path: ['edges', index, 'target'],
        message: `Edge "${e.id}" references unknown node "${e.target}".`,
      });
    }
  });

  // Without a complete edge set the trigger/cycle checks would be meaningless,
  // so bail out early.
  if (hasDangling) {
    return issues;
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

  const roots = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);

  if (roots.length === 0) {
    // Every node has an incoming edge → the whole graph is a cycle (or part
    // of one). Report no_trigger; the cycle members are everything left.
    issues.push({
      code: 'no_trigger',
      path: ['nodes'],
      message: 'Workflow must have exactly one trigger node (in-degree 0), found 0.',
      cycle: nodes.map((n) => n.id),
    });
    return issues;
  }

  if (roots.length > 1) {
    issues.push({
      code: 'multiple_triggers',
      path: ['nodes'],
      message: `Workflow must have exactly one trigger node (in-degree 0), found ${roots.length}.`,
    });
    return issues;
  }

  // Run Kahn's algorithm purely to detect downstream cycles (a graph can have
  // a single root and still contain a cycle that doesn't include the root).
  const remaining = new Map(inDegree);
  const queue: string[] = [roots[0]!.id];
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited += 1;
    for (const next of adjacency.get(current) ?? []) {
      const left = (remaining.get(next) ?? 0) - 1;
      remaining.set(next, left);
      if (left === 0) queue.push(next);
    }
  }

  if (visited !== nodes.length) {
    const cycle = nodes.filter((n) => (remaining.get(n.id) ?? 0) > 0).map((n) => n.id);
    issues.push({
      code: 'cycle',
      path: ['nodes'],
      message: `Circular dependency detected: ${cycle.join(' -> ')}`,
      cycle,
    });
  }

  return issues;
}
