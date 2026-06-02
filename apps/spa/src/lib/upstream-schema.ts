import type { Edge, Node } from 'reactflow';
import type { z } from 'zod';
import { getNodeOutputSchema, nodeOutputSchemas } from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import { NODE_OUTPUT_EXAMPLES } from '@/components/editor/preview/nodeOutputExamples';
import { derivePathsFromSample } from '@/lib/derive-suggestions';

export interface PathSuggestion {
  nodeId: string;
  nodeLabel: string;
  path: string;
  type: string;
}

export interface UpstreamSchemas {
  byNode: Record<string, z.ZodTypeAny>;
  suggestions: PathSuggestion[];
}

/**
 * Optional richer sources for upstream pills. Both are additive — without them
 * `getUpstreamSchemas` behaves exactly as before (static schema → example →
 * generic). `liveNodes` is satisfied by the executionLiveStore's node map; only
 * its `get` accessor is used (read-only, avoids Map invariance at the boundary).
 */
export interface UpstreamSchemaOptions {
  liveNodes?: { get(nodeId: string): { output: unknown } | undefined };
  /** Per-node sample override keyed by nodeId. Source lands in #259. */
  overrides?: Record<string, unknown>;
}

const MAX_DEPTH = 4;

export function getUpstreamSchemas(
  targetNodeId: string,
  nodes: Node<CustomNodeData>[],
  edges: Edge[],
  options: UpstreamSchemaOptions = {},
): UpstreamSchemas {
  const ancestorsByDistance = bfsAncestors(targetNodeId, edges);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const byNode: Record<string, z.ZodTypeAny> = {};
  const suggestions: PathSuggestion[] = [];

  for (const ancestorId of ancestorsByDistance) {
    const node = nodeById.get(ancestorId);
    if (!node) continue;
    const entries = resolveEntries(ancestorId, node.data.nodeType, options, byNode);
    if (entries.length === 0) continue;
    const label = node.data.label || ancestorId;
    for (const entry of entries) {
      suggestions.push({
        nodeId: ancestorId,
        nodeLabel: label,
        path: entry.path,
        type: entry.type,
      });
    }
  }

  return { byNode, suggestions };
}

interface PathEntry {
  path: string;
  type: string;
}

/**
 * Resolve one ancestor's pill paths by source precedence:
 *   per-node override → live output → concrete static schema → example → generic.
 * Sample sources (override/live/example) derive paths from runtime data;
 * schema sources walk the Zod schema. `byNode` is populated only for the schema
 * tiers (the only place a concrete Zod type exists).
 */
function resolveEntries(
  ancestorId: string,
  nodeType: string,
  options: UpstreamSchemaOptions,
  byNode: Record<string, z.ZodTypeAny>,
): PathEntry[] {
  const override = options.overrides?.[ancestorId];
  if (override !== undefined && override !== null) {
    return derivePathsFromSample(override);
  }

  const liveOutput = options.liveNodes?.get(ancestorId)?.output;
  if (liveOutput !== undefined && liveOutput !== null) {
    return derivePathsFromSample(liveOutput);
  }

  // Concrete, field-bearing schema beats the curated example so high-value
  // nodes show their real shape.
  const concrete = nodeOutputSchemas[nodeType];
  if (concrete) {
    byNode[ancestorId] = concrete;
    return walkSchema(concrete);
  }

  // Example fallback for types lacking a concrete schema (currently shadowed by
  // concrete schemas, but kept so a future example-only type derives real paths
  // before dropping to the generic record pill).
  const example = NODE_OUTPUT_EXAMPLES[nodeType];
  if (example !== undefined) {
    return derivePathsFromSample(example);
  }

  // Generic whole-output schema for catalog types without anything richer, so
  // every upstream node still offers at least one pill. Unknown types → none.
  const generic = getNodeOutputSchema(nodeType);
  if (generic) {
    byNode[ancestorId] = generic;
    return walkSchema(generic);
  }

  return [];
}

export function bfsAncestors(targetNodeId: string, edges: Edge[]): string[] {
  const reverseAdj = new Map<string, string[]>();
  for (const e of edges) {
    if (!reverseAdj.has(e.target)) reverseAdj.set(e.target, []);
    reverseAdj.get(e.target)!.push(e.source);
  }

  const visited = new Set<string>([targetNodeId]);
  const ordered: string[] = [];
  const queue: string[] = [targetNodeId];
  let depth = 0;
  const DEPTH_CAP = 32;

  while (queue.length > 0 && depth < DEPTH_CAP) {
    const next: string[] = [];
    for (const id of queue) {
      const sources = reverseAdj.get(id) ?? [];
      for (const source of sources) {
        if (visited.has(source)) continue;
        visited.add(source);
        ordered.push(source);
        next.push(source);
      }
    }
    queue.length = 0;
    queue.push(...next);
    depth++;
  }

  return ordered;
}

interface SchemaEntry {
  path: string;
  type: string;
}

export function walkSchema(schema: z.ZodTypeAny, prefix = '', depth = 0): SchemaEntry[] {
  if (depth > MAX_DEPTH) return [];
  const unwrapped = unwrap(schema);
  const def = unwrapped._def as { typeName: string };

  switch (def.typeName) {
    case 'ZodObject': {
      const obj = unwrapped as z.ZodObject<z.ZodRawShape>;
      const out: SchemaEntry[] = [];
      const shape = obj.shape;
      for (const [key, child] of Object.entries(shape)) {
        const childPath = prefix ? `${prefix}.${key}` : key;
        out.push(...walkSchema(child as z.ZodTypeAny, childPath, depth + 1));
      }
      if (out.length === 0 && prefix) {
        out.push({ path: prefix, type: 'object' });
      }
      return out;
    }
    case 'ZodArray': {
      const arr = unwrapped as z.ZodArray<z.ZodTypeAny>;
      const elementSchema = arr._def.type;
      const childPath = prefix ? `${prefix}.0` : '0';
      const childEntries = walkSchema(elementSchema, childPath, depth + 1);
      if (childEntries.length === 0) {
        return [{ path: childPath, type: 'array-element' }];
      }
      return childEntries;
    }
    case 'ZodRecord':
    case 'ZodMap':
    case 'ZodUnknown':
    case 'ZodAny': {
      return [{ path: prefix || '', type: 'record' }];
    }
    default: {
      if (!prefix) {
        return [{ path: '', type: zodTypeLabel(def.typeName) }];
      }
      return [{ path: prefix, type: zodTypeLabel(def.typeName) }];
    }
  }
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current: z.ZodTypeAny = schema;
  for (let i = 0; i < 8; i++) {
    const def = current._def as { typeName: string; innerType?: z.ZodTypeAny };
    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodNullable') {
      if (def.innerType) {
        current = def.innerType;
        continue;
      }
    }
    if (def.typeName === 'ZodLazy') {
      const lazyDef = current._def as { getter?: () => z.ZodTypeAny };
      if (lazyDef.getter) {
        current = lazyDef.getter();
        continue;
      }
    }
    return current;
  }
  return current;
}

function zodTypeLabel(typeName: string): string {
  return typeName.replace(/^Zod/, '').toLowerCase();
}
