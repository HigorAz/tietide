import type { Edge, Node } from 'reactflow';
import {
  TEMPLATE_OPERATORS,
  TEMPLATE_TOKEN_REGEX,
  TRIGGER_ALIAS,
  assignNodeAliases,
  nodeOutputSchemas,
  type WorkflowNode,
} from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import { bfsAncestors } from '@/lib/upstream-schema';

export type InvalidReferenceReason = 'missing' | 'not-upstream' | 'unknown-field';

export interface InvalidReference {
  nodeId: string;
  fieldKey: string;
  token: string;
  reason: InvalidReferenceReason;
}

const RESERVED_ENV_RE = /^[A-Z][A-Z0-9_]*$/;
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const OPERATOR_NAMES = new Set<string>(TEMPLATE_OPERATORS.map((o) => o.name));

interface ValidationContext {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
  nodeById: Map<string, Node<CustomNodeData>>;
  triggerId: string | undefined;
  aliasToId: Map<string, string>;
}

function buildContext(nodes: Node<CustomNodeData>[], edges: Edge[]): ValidationContext {
  const aliasMap = assignNodeAliases(nodes.map(toAliasInput));
  const aliasToId = new Map<string, string>();
  let triggerId: string | undefined;
  for (const [id, alias] of aliasMap) {
    if (alias === TRIGGER_ALIAS) triggerId = id;
    else aliasToId.set(alias, id);
  }
  return { nodes, edges, nodeById: new Map(nodes.map((n) => [n.id, n])), triggerId, aliasToId };
}

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

interface ParsedToken {
  /** Resolved node id this token points at, or undefined if the root is unknown. */
  targetId: string | undefined;
  /** First path segment after the root, for concrete-schema field checks. */
  firstField: string | undefined;
}

// Map a token's inner expression to the node it references. Roots:
//   trigger(.field…)        → the trigger node
//   steps.<alias>(.field…)  → the action with that alias
//   <nodeId>(.field…)       → legacy id-keyed reference (back-compat)
function parseToken(inner: string, ctx: ValidationContext): ParsedToken | null {
  const segments = inner.split('.').map((s) => s.trim());
  const head = segments[0];
  if (head === undefined || head.length === 0) return null;

  if (head === TRIGGER_ALIAS) {
    return { targetId: ctx.triggerId, firstField: segments[1] };
  }
  if (head === 'steps') {
    const alias = segments[1];
    return { targetId: alias ? ctx.aliasToId.get(alias) : undefined, firstField: segments[2] };
  }
  // Legacy id-keyed token.
  return { targetId: ctx.nodeById.has(head) ? head : undefined, firstField: segments[1] };
}

function concreteFieldKeys(nodeType: string): Set<string> | null {
  const schema = nodeOutputSchemas[nodeType] as
    | { _def?: { typeName?: string }; shape?: Record<string, unknown> }
    | undefined;
  if (!schema || schema._def?.typeName !== 'ZodObject' || !schema.shape) return null;
  return new Set(Object.keys(schema.shape));
}

function classify(
  inner: string,
  ctx: ValidationContext,
  ancestors: Set<string>,
): InvalidReferenceReason | null {
  const parsed = parseToken(inner, ctx);
  if (!parsed) return null;
  if (parsed.targetId === undefined) return 'missing';
  if (!ancestors.has(parsed.targetId)) return 'not-upstream';

  // Best-effort field check: only for nodes with a concrete object schema and a
  // plain identifier first segment that isn't a chained operator.
  const field = parsed.firstField;
  if (field && IDENTIFIER_RE.test(field) && !OPERATOR_NAMES.has(field)) {
    const node = ctx.nodeById.get(parsed.targetId);
    const keys = node ? concreteFieldKeys(node.data.nodeType) : null;
    if (keys && !keys.has(field)) return 'unknown-field';
  }
  return null;
}

// Walk a config tree, yielding [topLevelFieldKey, tokenInner, fullToken] for each
// data-pill token (env UPPER_SNAKE tokens are skipped — they are not node refs).
function* eachToken(
  value: unknown,
  fieldKey: string,
): Generator<{ fieldKey: string; inner: string; token: string }> {
  if (typeof value === 'string') {
    TEMPLATE_TOKEN_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TEMPLATE_TOKEN_REGEX.exec(value)) !== null) {
      const inner = (m[1] ?? '').trim();
      if (inner.length === 0 || RESERVED_ENV_RE.test(inner)) continue;
      yield { fieldKey, inner, token: m[0] };
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) yield* eachToken(entry, fieldKey);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) yield* eachToken(v, fieldKey);
  }
}

function nodeInvalid(node: Node<CustomNodeData>, ctx: ValidationContext): InvalidReference[] {
  const config = node.data.config;
  if (!config) return [];
  const ancestors = new Set(bfsAncestors(node.id, ctx.edges));
  const out: InvalidReference[] = [];
  for (const [key, value] of Object.entries(config)) {
    for (const { fieldKey, inner, token } of eachToken(value, key)) {
      const reason = classify(inner, ctx, ancestors);
      if (reason) out.push({ nodeId: node.id, fieldKey, token, reason });
    }
  }
  return out;
}

/** Every data-pill reference in the workflow that points at a missing, non-upstream, or unknown field. */
export function findInvalidReferences(
  nodes: Node<CustomNodeData>[],
  edges: Edge[],
): InvalidReference[] {
  const ctx = buildContext(nodes, edges);
  return nodes.flatMap((n) => nodeInvalid(n, ctx));
}

/** The set of full `{{…}}` tokens that are invalid for a single node (drives red highlighting). */
export function invalidTokensForNode(
  nodeId: string,
  nodes: Node<CustomNodeData>[],
  edges: Edge[],
): Set<string> {
  const ctx = buildContext(nodes, edges);
  const node = ctx.nodeById.get(nodeId);
  if (!node) return new Set();
  return new Set(nodeInvalid(node, ctx).map((r) => r.token));
}
