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
