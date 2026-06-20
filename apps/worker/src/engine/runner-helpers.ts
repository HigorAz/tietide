// Pure, dependency-free helpers shared by WorkflowRunner and IteratorExecutor.
// Extracted from workflow-runner.ts so the iterator collaborator can reuse them
// without a circular dependency. None of these touch `this`, the DB, or events.
import {
  NODE_CATALOG,
  NodeCategory,
  PILL_SAMPLE_KEY,
  RESERVED_CONFIG_KEYS,
  TRIGGER_ALIAS,
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

/**
 * Read a trigger node's declared output sample (`__pillSample`) as a data object,
 * or `{}` when it is absent or not a plain object. Used only to seed a trigger's
 * output during a sample-less test/dry-run (see buildInput).
 */
function triggerSampleData(n: WorkflowNode): Record<string, unknown> {
  const sample = (n.config as Record<string, unknown>)[PILL_SAMPLE_KEY];
  if (sample !== null && typeof sample === 'object' && !Array.isArray(sample)) {
    return sample as Record<string, unknown>;
  }
  return {};
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
    // A root node's data is the run's trigger payload. During a node-test or
    // dry-run there is no live webhook, so triggerData is absent — fall back to
    // the trigger's declared output sample (`__pillSample`) so downstream
    // {{trigger.*}} pills resolve instead of failing "Template path not found".
    // Only TRIGGER nodes fall back: an action root's sample is its own captured
    // OUTPUT, not its input, so feeding it back as input would be wrong.
    data = triggerData ?? (isTriggerNode(n) ? triggerSampleData(n) : {});
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
  aliasMap?: ReadonlyMap<string, string>,
): NodeInput {
  // `scope` is the node-id-keyed map surfaced to executors as `$nodes` (the SDK
  // contract — unchanged). `resolution` additionally carries the friendly alias
  // roots (`trigger`, `steps.<alias>`) consumed only by template resolution, so
  // `{{trigger.field}}` / `{{steps.<alias>.field}}` resolve while legacy
  // `{{node-<id>.field}}` tokens keep working via the node-id keys.
  const scope: Record<string, unknown> = {};
  const resolution: Record<string, unknown> = {};
  const steps: Record<string, unknown> = {};
  let hasSteps = false;
  for (const id of executionOrder) {
    const out = outputs.get(id);
    if (!out) continue;
    scope[id] = out.data;
    resolution[id] = out.data;
    const alias = aliasMap?.get(id);
    if (alias === TRIGGER_ALIAS) {
      resolution[TRIGGER_ALIAS] = out.data;
    } else if (alias !== undefined) {
      steps[alias] = out.data;
      hasSteps = true;
    }
  }
  if (hasSteps) resolution.steps = steps;
  const resolvedParams = resolveTemplate(input.params, resolution, envScope) as Record<
    string,
    unknown
  >;
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
