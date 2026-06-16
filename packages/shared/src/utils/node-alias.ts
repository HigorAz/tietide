// Stable, human-readable aliases for workflow nodes. Data-pill tokens reference
// upstream outputs by alias (`{{trigger.field}}`, `{{steps.<slug>.field}}`)
// instead of the raw node id (`{{node-<uuid>.field}}`), so fields read cleanly
// and survive node renames/reordering.
//
// The SAME function produces the alias map on both sides — the SPA (which emits
// the tokens) and the worker (which builds the resolution scope) — so the two
// never drift. Determinism comes from honoring any stored `alias` first, then
// deriving the rest from `node.name` in array order with numeric-suffix dedupe.
import { NODE_CATALOG, NodeCategory } from '../types/node.types.js';
import type { WorkflowNode } from '../types/workflow.types.js';

/** The single trigger node is always referenced as `{{trigger.…}}`. */
export const TRIGGER_ALIAS = 'trigger';

// Scope container keys an action alias must never collide with: `trigger` holds
// the trigger output, `steps` holds the per-action map. An action whose name
// slugifies to either gets a numeric suffix (e.g. `steps_2`).
const RESERVED_ALIASES = new Set<string>([TRIGGER_ALIAS, 'steps']);

/** Lowercase a node name into a safe identifier-ish slug (`Gmail: Search` → `gmail_search`). */
export function slugifyAlias(name: string): string {
  // codeql[js/polynomial-redos] — false positive: these are linear single-class
  // global replaces (no nested/overlapping quantifiers), run on short node names.
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug.length > 0 ? slug : 'node';
}

function isTriggerType(type: string): boolean {
  return NODE_CATALOG.find((d) => d.type === type)?.category === NodeCategory.TRIGGER;
}

function dedupe(base: string, used: Set<string>): string {
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${i}`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Map every node id to its stable alias. The first trigger node → `trigger`;
 * every other node → its stored `alias` when present and free, else a deduped
 * slug of its `name`. Reserved container words (`trigger`, `steps`) are never
 * handed to an action.
 */
export function assignNodeAliases(nodes: readonly WorkflowNode[]): Map<string, string> {
  const aliases = new Map<string, string>();
  // Pre-seed the reserved container words so no action alias can shadow them.
  const used = new Set<string>(RESERVED_ALIASES);
  let triggerClaimed = false;

  // Pass 1 — honor valid, unique stored aliases on non-trigger nodes so a saved
  // reference like `{{steps.gmail_search.x}}` keeps pointing at the same node.
  for (const node of nodes) {
    if (isTriggerType(node.type)) continue;
    const stored = (node as { alias?: unknown }).alias;
    if (
      typeof stored === 'string' &&
      stored.length > 0 &&
      !RESERVED_ALIASES.has(stored) &&
      !used.has(stored)
    ) {
      aliases.set(node.id, stored);
      used.add(stored);
    }
  }

  // Pass 2 — claim `trigger` for the first trigger, then derive the rest.
  for (const node of nodes) {
    if (aliases.has(node.id)) continue;
    if (isTriggerType(node.type) && !triggerClaimed) {
      aliases.set(node.id, TRIGGER_ALIAS);
      triggerClaimed = true;
      continue;
    }
    aliases.set(node.id, dedupe(slugifyAlias(node.name), used));
  }

  return aliases;
}
