// Pure, dependency-free helpers shared by WorkflowRunner and IteratorExecutor.
// Extracted from workflow-runner.ts so the iterator collaborator can reuse them
// without a circular dependency. None of these touch `this`, the DB, or events.
import {
  NODE_CATALOG,
  NodeCategory,
  RESERVED_CONFIG_KEYS,
  resolveTemplate,
  type EnvScope,
  type WorkflowNode,
  type WorkflowEdge,
} from '@tietide/shared';
import type { NodeInput, NodeOutput } from '@tietide/sdk';

export function extractErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * Drop editor-only reserved keys (e.g. the data-pill `__pillSample`) from a node
 * config so they never reach an executor's params. Returns the original object
 * untouched when no reserved key is present (avoids needless allocation).
 */
export function stripReservedConfigKeys(config: Record<string, unknown>): Record<string, unknown> {
  if (!RESERVED_CONFIG_KEYS.some((key) => key in config)) return config;
  const sanitized: Record<string, unknown> = { ...config };
  for (const key of RESERVED_CONFIG_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

export function buildInput(
  n: WorkflowNode,
  executionOrder: string[],
  incoming: WorkflowEdge[],
  outputs: Map<string, NodeOutput>,
  triggerData?: Record<string, unknown>,
) {
  let data: Record<string, unknown> = {};
  if (incoming.length === 0) {
    data = triggerData ?? {};
  } else {
    // Only predecessors that actually produced an output (executed or
    // skipped-passthrough) feed this node; cancelled/unreached ones do not.
    const predecessorIds = executionOrder.filter(
      (id) => incoming.some((e) => e.source === id) && outputs.has(id),
    );
    // input.data is the flat output of the LAST executed predecessor (the
    // established passthrough contract). On fan-in, every predecessor's output
    // is still exposed to the executor via input.scope (the `$nodes` map) and
    // `{{nodeId.field}}` template refs, so no branch is lost — W3.10's goal,
    // now carried by scope rather than by overloading input.data (#260).
    const lastId = predecessorIds[predecessorIds.length - 1];
    data = lastId ? (outputs.get(lastId)?.data ?? {}) : {};
  }
  const rawConnectionId = (n.config as { connectionId?: unknown }).connectionId;
  const connectionId = typeof rawConnectionId === 'string' ? rawConnectionId : undefined;
  // Reserved keys (e.g. the data-pill `__pillSample`) live on the node config
  // for the editor only — strip them so they never reach the executor's params.
  const params = stripReservedConfigKeys(n.config);
  return connectionId ? { data, params, connectionId } : { data, params };
}

export function resolveInputTemplates(
  input: NodeInput,
  executionOrder: string[],
  outputs: Map<string, NodeOutput>,
  envScope: EnvScope,
): NodeInput {
  const scope: Record<string, unknown> = {};
  for (const id of executionOrder) {
    const out = outputs.get(id);
    if (out) scope[id] = out.data;
  }
  const resolvedParams = resolveTemplate(input.params, scope, envScope) as Record<string, unknown>;
  // Surface the same upstream scope that drove template resolution so executors
  // (e.g. the Code node's `$nodes`) can read sibling/ancestor outputs directly.
  return { ...input, params: resolvedParams, scope };
}

export function propagateReachability(
  output: NodeOutput,
  outgoing: WorkflowEdge[],
  reachable: Set<string>,
  outcome: 'success' | 'error',
): void {
  const branch = output.metadata?.branch as string | undefined;
  for (const e of outgoing) {
    const edgeKind = e.kind ?? 'success';
    if (edgeKind !== outcome) continue;
    if (outcome === 'error') {
      reachable.add(e.target);
      continue;
    }
    if (e.sourceHandle === undefined) {
      reachable.add(e.target);
    } else if (branch !== undefined && e.sourceHandle === branch) {
      reachable.add(e.target);
    }
  }
}

// Classify why an unreachable node (with no global failure in effect) did not run:
// SKIPPED when a conditional branched around it, CANCELLED when an upstream failure
// or an un-fired error-handler edge abandoned its path. Predecessors are processed
// earlier in topological order, so their final status is already known.
export function classifyUnreached(
  incoming: WorkflowEdge[],
  statusByNode: Map<string, string>,
): 'CANCELLED' | 'SKIPPED' {
  for (const e of incoming) {
    // An error-handler edge that did not fire (we are unreachable) means its source
    // did not route here — the handler is a contingency that was cancelled.
    if ((e.kind ?? 'success') === 'error') return 'CANCELLED';
    // A success edge that was not taken because its source failed/was cancelled
    // propagates the cancellation; a conditional that simply chose another branch
    // (source SUCCESS) or a skipped source leaves us SKIPPED.
    const sourceStatus = statusByNode.get(e.source);
    if (sourceStatus === 'FAILED' || sourceStatus === 'CANCELLED') return 'CANCELLED';
  }
  return 'SKIPPED';
}

export function isTriggerNode(n: WorkflowNode): boolean {
  return NODE_CATALOG.find((d) => d.type === n.type)?.category === NodeCategory.TRIGGER;
}
