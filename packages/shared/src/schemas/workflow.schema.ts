import { z } from 'zod';

// Node types that exist in the SPA (form, icon, type) but have no executor in the
// worker NodeRegistry. Workflow definitions referencing these are rejected at
// save time so users cannot persist a workflow that the engine cannot run.
// TODO(S13): replace with an allow-list keyed off NodeRegistry.types() once
// the sandboxed `code` executor (CLAUDE.md §10) lands.
export const FORBIDDEN_NODE_TYPES: ReadonlySet<string> = new Set(['code']);

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
  nodes: z.array(workflowNodeSchema).min(1),
  edges: z.array(workflowEdgeSchema),
});

// Stricter variant: structurally identical to workflowDefinitionSchema but
// rejects any node whose `type` has no registered executor. Use this at save
// boundaries (API create/update). The looser schema is kept for fixtures and
// import tooling that operate on definitions before execution policy applies.
export const executableWorkflowDefinitionSchema = workflowDefinitionSchema.superRefine(
  (definition, ctx) => {
    definition.nodes.forEach((node, index) => {
      if (FORBIDDEN_NODE_TYPES.has(node.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nodes', index, 'type'],
          message: `Node type "${node.type}" is not yet executable`,
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
});
