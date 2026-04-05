import { z } from 'zod';

export const workflowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1).max(255),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  config: z.record(z.unknown()),
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
});

export const workflowDefinitionSchema = z.object({
  nodes: z.array(workflowNodeSchema).min(1),
  edges: z.array(workflowEdgeSchema),
});

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
