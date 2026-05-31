import { z } from 'zod';
import { NodeType } from '../types/node.types.js';

// Node types that exist in the SPA (form, icon, type) but have no executor in the
// worker NodeRegistry. Workflow definitions referencing these are rejected at
// save time so users cannot persist a workflow that the engine cannot run.
// Currently empty: the sandboxed `code` executor (CLAUDE.md §10) shipped, so
// `code` is fully executable. Add a type here only if its SPA form is being
// previewed before its worker executor lands.
export const FORBIDDEN_NODE_TYPES: ReadonlySet<string> = new Set<string>();

// Positive allow-list of every node `type` the platform recognizes, derived from
// the canonical NodeType catalog so it stays in lockstep with it. The save
// boundary rejects any node whose `type` is not in this set — an attacker (or a
// stale client) cannot persist a workflow referencing a node the engine has
// never heard of, which would otherwise sit as unvalidated JSONB.
export const KNOWN_NODE_TYPES: ReadonlySet<string> = new Set<string>(Object.values(NodeType));

// Keys JavaScript treats specially on plain objects. Allowing them to round-trip
// through a JSONB column and back into a hydrated object is a prototype-pollution
// vector for any consumer that later deep-merges or walks the config (templating,
// redaction, serialization). Rejected anywhere in a node's `config` tree.
const DANGEROUS_CONFIG_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

// Defensive bound on `config` nesting so a pathologically deep object cannot blow
// the stack of a recursive consumer. Real node configs are shallow (a handful of
// levels); 20 leaves generous headroom.
export const MAX_CONFIG_DEPTH = 20;

export interface ConfigSafetyIssue {
  path: (string | number)[];
  message: string;
}

// Walks an arbitrary parsed-JSON value and returns the first structural safety
// issue (dangerous key or over-depth), or null when the value is safe. Pure and
// exported so it can be reused at the HTTP boundary and unit-tested in isolation.
export function findUnsafeConfigIssue(
  value: unknown,
  basePath: (string | number)[] = [],
  depth = 0,
): ConfigSafetyIssue | null {
  if (depth > MAX_CONFIG_DEPTH) {
    return { path: basePath, message: `Config nesting exceeds ${MAX_CONFIG_DEPTH} levels` };
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const issue = findUnsafeConfigIssue(value[i], [...basePath, i], depth + 1);
      if (issue) return issue;
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (DANGEROUS_CONFIG_KEYS.has(key)) {
        return { path: [...basePath, key], message: `Disallowed config key "${key}"` };
      }
      const issue = findUnsafeConfigIssue(record[key], [...basePath, key], depth + 1);
      if (issue) return issue;
    }
  }
  return null;
}

export const workflowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1).max(255),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  config: z.record(z.unknown()),
  skipped: z.boolean().optional(),
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  kind: z.enum(['success', 'error']).optional(),
});

export const workflowDefinitionSchema = z.object({
  // Empty `nodes` is valid: new workflows are created as drafts so the user
  // can pick a trigger from the sidebar instead of being committed to one
  // before the canvas opens. Topology rules (trigger count, no cycles, no
  // dangling edges) are enforced at execute/activate time, not at save time.
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
});

// Stricter variant: structurally identical to workflowDefinitionSchema but
// rejects any node whose `type` has no registered executor. Use this at save
// boundaries (API create/update). The looser schema is kept for fixtures and
// import tooling that operate on definitions before execution policy applies.
export const executableWorkflowDefinitionSchema = workflowDefinitionSchema.superRefine(
  (definition, ctx) => {
    definition.nodes.forEach((node, index) => {
      if (!KNOWN_NODE_TYPES.has(node.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nodes', index, 'type'],
          message: `Unknown node type "${node.type}"`,
        });
      } else if (FORBIDDEN_NODE_TYPES.has(node.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nodes', index, 'type'],
          message: `Node type "${node.type}" is not yet executable`,
        });
      }

      const configIssue = findUnsafeConfigIssue(node.config, ['nodes', index, 'config']);
      if (configIssue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: configIssue.path,
          message: configIssue.message,
        });
      }
    });
  },
);

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullable().optional(),
  definition: workflowDefinitionSchema,
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  definition: workflowDefinitionSchema.optional(),
  isActive: z.boolean().optional(),
  folderId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).max(20).optional(),
});
