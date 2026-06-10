// Pure value-formatting and path helpers shared by every dataviewer surface
// (JsonTree today; DataTable / RawJson / search-flatten later). No React here —
// these are byte-for-byte responsible for producing copy paths that the shared
// `{{ }}` expression engine (packages/shared template-engine) can resolve, so the
// segment grammar below mirrors `tokenize()` exactly.

import { buildPillToken } from '@/lib/dataPillToken';
import { TEMPLATE_OPERATORS } from '@tietide/shared';

/** Operator names that, used as object keys, the engine would parse as operators. */
const OPERATOR_KEYS = new Set<string>(TEMPLATE_OPERATORS.map((o) => o.name));

/** A key is dot-safe only if it is a plain identifier AND not an operator name. */
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const MAX_SCALAR_LEN = 160;

export type ValueKind = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object';

export interface Leaf {
  path: string;
  value: unknown;
}

/** Classify a JSON value into one of the viewer's display kinds (undefined → 'null'). */
export function classifyValue(value: unknown): ValueKind {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  return 'object';
}

/** Render a scalar for display: strings are quoted (and truncated at 160 chars). */
export function formatScalar(value: unknown): string {
  if (typeof value === 'string') {
    const body = value.length > MAX_SCALAR_LEN ? `${value.slice(0, MAX_SCALAR_LEN)}…` : value;
    return `"${body}"`;
  }
  if (value === null || value === undefined) return 'null';
  return String(value);
}

/** Count badge for a branch: `[N items]` / `{N fields}`; null for scalars. */
export function branchBadge(value: unknown): string | null {
  if (Array.isArray(value)) {
    return `[${value.length} ${value.length === 1 ? 'item' : 'items'}]`;
  }
  if (classifyValue(value) === 'object') {
    const n = Object.keys(value as Record<string, unknown>).length;
    return `{${n} ${n === 1 ? 'field' : 'fields'}}`;
  }
  return null;
}

/** Bracket-escape a non-identifier / operator-name key as `['key']` (or `["k"]`). */
function escapeKey(key: string): string {
  if (key.includes("'")) return `["${key}"]`;
  return `['${key}']`;
}

/**
 * Extend `parent` with a child `key`. Numeric keys emit `[n]` and attach WITHOUT a
 * leading dot (engine grammar); identifier keys join with a dot; everything else is
 * bracket-escaped. An empty parent yields the bare segment (`messages`, `[0]`).
 */
export function childPath(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`;
  const segment = IDENT_RE.test(key) && !OPERATOR_KEYS.has(key) ? `.${key}` : escapeKey(key);
  if (parent.length === 0) {
    // Strip the leading dot for the root identifier; bracket segments keep their form.
    return segment.startsWith('.') ? segment.slice(1) : segment;
  }
  return `${parent}${segment}`;
}

/**
 * Wrap a path into a `{{ref.path}}` pill via buildPillToken. When the path begins
 * with a bracket segment (`[0]` / `['key']`) it must attach without the joining dot,
 * so prepend it directly to the ref instead.
 */
export function buildPillPath(ref: string, path: string): string {
  if (path.startsWith('[')) return `{{${ref}${path}}}`;
  return buildPillToken(ref, path);
}

/** Depth-first walk yielding every scalar leaf with its engine-resolvable path. */
export function flattenLeaves(value: unknown, parent = ''): Leaf[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => flattenLeaves(item, childPath(parent, i)));
  }
  if (classifyValue(value) === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj).flatMap((k) => flattenLeaves(obj[k], childPath(parent, k)));
  }
  return [{ path: parent, value }];
}

/** Case-insensitive substring match against a leaf's path or its formatted value. */
export function matchesSearch(leaf: Leaf, query: string): boolean {
  const q = query.toLowerCase();
  if (leaf.path.toLowerCase().includes(q)) return true;
  return formatScalar(leaf.value).toLowerCase().includes(q);
}
