import type { Edge, Node } from 'reactflow';
import {
  PILL_SAMPLE_KEY,
  TEMPLATE_OPERATORS,
  TEMPLATE_TOKEN_REGEX,
  TRIGGER_ALIAS,
  assignNodeAliases,
  type WorkflowNode,
} from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import {
  bfsAncestors,
  getUpstreamSchemas,
  type PathSuggestion,
  type UpstreamSchemaOptions,
} from '@/lib/upstream-schema';
import { parsePillSample } from '@/lib/parsePillSample';

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
  /** Per-node `__pillSample` overrides keyed by nodeId. */
  overrides: Record<string, unknown>;
  /** Live run output keyed by nodeId — wins over a (possibly stale) sample. */
  liveNodes: UpstreamSchemaOptions['liveNodes'];
}

function buildContext(
  nodes: Node<CustomNodeData>[],
  edges: Edge[],
  liveNodes?: UpstreamSchemaOptions['liveNodes'],
): ValidationContext {
  const aliasMap = assignNodeAliases(nodes.map(toAliasInput));
  const aliasToId = new Map<string, string>();
  let triggerId: string | undefined;
  for (const [id, alias] of aliasMap) {
    if (alias === TRIGGER_ALIAS) triggerId = id;
    else aliasToId.set(alias, id);
  }
  return {
    nodes,
    edges,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
    triggerId,
    aliasToId,
    overrides: buildOverrides(nodes),
    liveNodes,
  };
}

// A user-declared OUTPUT SAMPLE (or a "Test this node" capture) stored under
// `__pillSample`, and the live run output, are both richer pill sources than the
// static schema. Building them here lets the validator agree with the picker: a
// field the picker offers is never flagged as a broken pill.
function buildOverrides(nodes: Node<CustomNodeData>[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const n of nodes) {
    const parsed = parsePillSample(n.data.config?.[PILL_SAMPLE_KEY]);
    if (parsed !== undefined) map[n.id] = parsed;
  }
  return map;
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
  /** First path segment after the root, for field-existence checks. */
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

interface NodeFields {
  /** The node exposes a whole-output/record pill — any first field is acceptable. */
  anyField: boolean;
  /** Known top-level field names the node offers as pills. */
  fields: Set<string>;
}

// Fold the picker's own suggestions (for one target node's upstream graph) into a
// per-ancestor field set. Because this is the SAME resolution the data-pill picker
// uses (live output → sample override → static schema → example → generic), a field
// the picker offers is never rejected here. A suggestion with an empty path means the
// node's whole output is a record/unknown — no concrete fields to validate.
function buildFieldIndex(suggestions: PathSuggestion[]): Map<string, NodeFields> {
  const index = new Map<string, NodeFields>();
  for (const s of suggestions) {
    let entry = index.get(s.nodeId);
    if (!entry) {
      entry = { anyField: false, fields: new Set<string>() };
      index.set(s.nodeId, entry);
    }
    const first = s.path.split('.')[0];
    if (!first) entry.anyField = true;
    else entry.fields.add(first);
  }
  return index;
}

function classify(
  inner: string,
  ctx: ValidationContext,
  ancestors: Set<string>,
  fieldIndex: Map<string, NodeFields>,
): InvalidReferenceReason | null {
  const parsed = parseToken(inner, ctx);
  if (!parsed) return null;
  if (parsed.targetId === undefined) return 'missing';
  if (!ancestors.has(parsed.targetId)) return 'not-upstream';

  // Best-effort field check: only for a plain identifier first segment that isn't
  // a chained operator, and only when the node exposes a concrete field set.
  const field = parsed.firstField;
  if (field && IDENTIFIER_RE.test(field) && !OPERATOR_NAMES.has(field)) {
    const entry = fieldIndex.get(parsed.targetId);
    if (entry && !entry.anyField && entry.fields.size > 0 && !entry.fields.has(field)) {
      return 'unknown-field';
    }
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
  // Skip the upstream-schema resolution for nodes with no pill tokens at all.
  if (!JSON.stringify(config).includes('{{')) return [];

  const ancestors = new Set(bfsAncestors(node.id, ctx.edges));
  const { suggestions } = getUpstreamSchemas(node.id, ctx.nodes, ctx.edges, {
    overrides: ctx.overrides,
    liveNodes: ctx.liveNodes,
  });
  const fieldIndex = buildFieldIndex(suggestions);

  const out: InvalidReference[] = [];
  for (const [key, value] of Object.entries(config)) {
    for (const { fieldKey, inner, token } of eachToken(value, key)) {
      const reason = classify(inner, ctx, ancestors, fieldIndex);
      if (reason) out.push({ nodeId: node.id, fieldKey, token, reason });
    }
  }
  return out;
}

/**
 * Every data-pill reference in the workflow that points at a missing, non-upstream,
 * or unknown field. Pass `liveNodes` (the executionLiveStore node map) so validation
 * uses the same live-output-first resolution as the picker — without it, a sample that
 * went stale after an output-shape change would wrongly flag the now-correct pills.
 */
export function findInvalidReferences(
  nodes: Node<CustomNodeData>[],
  edges: Edge[],
  liveNodes?: UpstreamSchemaOptions['liveNodes'],
): InvalidReference[] {
  const ctx = buildContext(nodes, edges, liveNodes);
  return nodes.flatMap((n) => nodeInvalid(n, ctx));
}

/** The set of full `{{…}}` tokens that are invalid for a single node (drives red highlighting). */
export function invalidTokensForNode(
  nodeId: string,
  nodes: Node<CustomNodeData>[],
  edges: Edge[],
  liveNodes?: UpstreamSchemaOptions['liveNodes'],
): Set<string> {
  const ctx = buildContext(nodes, edges, liveNodes);
  const node = ctx.nodeById.get(nodeId);
  if (!node) return new Set();
  return new Set(nodeInvalid(node, ctx).map((r) => r.token));
}
