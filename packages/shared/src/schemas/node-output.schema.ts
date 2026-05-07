import { z } from 'zod';

export const webhookTriggerOutputSchema = z.record(z.unknown());

export const cronTriggerOutputSchema = z.record(z.unknown());

export const manualTriggerOutputSchema = z.record(z.unknown());

export const httpRequestOutputSchema = z.object({
  statusCode: z.number(),
  headers: z.record(z.string()),
  body: z.unknown(),
  duration: z.number(),
});

export const conditionalOutputSchema = z.object({
  branch: z.boolean(),
  evaluatedCondition: z.string(),
});

export const iteratorOutputSchema = z.object({
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const subworkflowOutputSchema = z.record(z.unknown());

export const returnOutputSchema = z.object({
  value: z.unknown(),
});

export const nodeOutputSchemas: Record<string, z.ZodTypeAny> = {
  'webhook-trigger': webhookTriggerOutputSchema,
  'cron-trigger': cronTriggerOutputSchema,
  'manual-trigger': manualTriggerOutputSchema,
  'http-request': httpRequestOutputSchema,
  conditional: conditionalOutputSchema,
  iterator: iteratorOutputSchema,
  subworkflow: subworkflowOutputSchema,
  return: returnOutputSchema,
};
