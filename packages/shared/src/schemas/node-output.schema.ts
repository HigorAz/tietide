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

// Standardized output for AI/LLM action nodes (Claude, OpenAI, Ollama). All three
// nodes normalize their provider-specific responses into this shape so downstream
// nodes can data-pill `{{node.text}}`, `{{node.usage.inputTokens}}`, etc. without
// caring which provider produced the result.
export const aiNodeOutputSchema = z.object({
  text: z.string(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  model: z.string(),
  finishReason: z.string().nullable(),
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
  'claude-messages': aiNodeOutputSchema,
  'openai-chat-completion': aiNodeOutputSchema,
  'ollama-generate': aiNodeOutputSchema,
};
