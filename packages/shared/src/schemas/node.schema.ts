import { z } from 'zod';

export const httpRequestConfigSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  timeout: z.number().positive().max(30000).optional(),
});

export const conditionalConfigSchema = z.object({
  condition: z.string().min(1),
});

export const codeConfigSchema = z.object({
  code: z.string().min(1).max(10000),
  language: z.enum(['javascript']).default('javascript'),
});

export const cronConfigSchema = z.object({
  expression: z
    .string()
    .min(1)
    .regex(/^[\d*,\-/\s]+$/, 'Invalid cron expression'),
});

export const webhookConfigSchema = z.object({
  path: z.string().min(1).max(255).optional(),
});

export const ITERATOR_MAX_ITEMS_DEFAULT = 1000;

export const iteratorConfigSchema = z.object({
  arrayPath: z.string().min(1),
  continueOnError: z.boolean().default(false),
  maxItems: z.number().int().positive().max(ITERATOR_MAX_ITEMS_DEFAULT).optional(),
});

export const subworkflowConfigSchema = z.object({
  workflowId: z.string().uuid(),
  // Map of trigger-input keys to data-pill expressions. The runner template-
  // resolves the whole config before the node executes, so at execution time
  // the resolved value of any single-token data pill could be any JSON type
  // (string / number / object / array). Validation is permissive on the
  // value side; the SPA enforces string templates at save time.
  inputMapping: z.record(z.unknown()).default({}),
});

export const returnConfigSchema = z.object({
  value: z.string().optional(),
});
