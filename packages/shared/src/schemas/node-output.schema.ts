import { z } from 'zod';
import { NODE_CATALOG, NodeCategory } from '../types/node.types.js';

export const webhookTriggerOutputSchema = z.record(z.unknown());

export const cronTriggerOutputSchema = z.record(z.unknown());

export const manualTriggerOutputSchema = z.record(z.unknown());

export const httpRequestOutputSchema = z.object({
  statusCode: z.number(),
  headers: z.record(z.string()),
  body: z.unknown(),
  duration: z.number(),
});

// The Code node's output IS the JSON-cloned object the user's script returned —
// its fields land at the top level (referenced as {{steps.code.field}}), so the
// shape is open. A non-object return nests under `result`. The picker derives
// precise field pills from a live run or the node's Output sample, not this
// schema. See apps/worker/src/nodes/actions/code.ts.
export const codeOutputSchema = z.record(z.unknown());

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

// ── High-value trigger output schemas ───────────────────────────────────────
// These mirror the curated NODE_OUTPUT_EXAMPLES shapes and the trigger emitters
// in apps/worker + apps/api. Concrete shapes let downstream nodes data-pill the
// individual fields (e.g. `{{ trigger.subject }}`) instead of the whole payload.
// Push triggers that carry raw, provider-shaped payloads intentionally fall back
// to the generic record schema via getNodeOutputSchema().

export const gmailMessageReceivedOutputSchema = z.object({
  messageId: z.string(),
  threadId: z.string(),
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  snippet: z.string(),
  receivedAt: z.string(),
});

export const driveFileAddedOutputSchema = z.object({
  fileId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  webViewLink: z.string(),
  createdTime: z.string(),
});

export const sheetsRowAddedOutputSchema = z.object({
  spreadsheetId: z.string(),
  sheetName: z.string(),
  rowIndex: z.number().int().nonnegative(),
  values: z.record(z.unknown()),
});

export const slackMessageReceivedOutputSchema = z.object({
  channel: z.string(),
  channelName: z.string(),
  user: z.string(),
  text: z.string(),
  ts: z.string(),
});

export const discordMessageReceivedOutputSchema = z.object({
  channelId: z.string(),
  guildId: z.string(),
  author: z.object({ id: z.string(), username: z.string() }),
  content: z.string(),
});

export const telegramMessageReceivedOutputSchema = z.object({
  messageId: z.number().int(),
  chatId: z.number().int(),
  from: z.object({ id: z.number().int(), username: z.string() }),
  text: z.string(),
  date: z.number().int(),
});

export const twilioSmsReceivedOutputSchema = z.object({
  from: z.string(),
  to: z.string(),
  body: z.string(),
  messageSid: z.string(),
});

export const stripeEventReceivedOutputSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ object: z.record(z.unknown()) }),
  created: z.number().int(),
});

// Concrete, field-bearing schemas keyed by node type. Node types NOT listed here
// fall back to GENERIC_OUTPUT_SCHEMA (whole-output pill) via getNodeOutputSchema()
// as long as they are real catalog node types.
export const nodeOutputSchemas: Record<string, z.ZodTypeAny> = {
  'webhook-trigger': webhookTriggerOutputSchema,
  'cron-trigger': cronTriggerOutputSchema,
  'manual-trigger': manualTriggerOutputSchema,
  'http-request': httpRequestOutputSchema,
  code: codeOutputSchema,
  conditional: conditionalOutputSchema,
  iterator: iteratorOutputSchema,
  subworkflow: subworkflowOutputSchema,
  return: returnOutputSchema,
  'claude-messages': aiNodeOutputSchema,
  'openai-chat-completion': aiNodeOutputSchema,
  'ollama-generate': aiNodeOutputSchema,
  'anthropic-vision': aiNodeOutputSchema,
  'gmail-message-received': gmailMessageReceivedOutputSchema,
  'drive-file-added': driveFileAddedOutputSchema,
  'sheets-row-added': sheetsRowAddedOutputSchema,
  'slack-message-received': slackMessageReceivedOutputSchema,
  'discord-message-received': discordMessageReceivedOutputSchema,
  'telegram-message-received': telegramMessageReceivedOutputSchema,
  'twilio-sms-received': twilioSmsReceivedOutputSchema,
  'stripe-event-received': stripeEventReceivedOutputSchema,
};

// Generic passthrough shape for nodes without a concrete output schema. The data
// pill picker walks this to a single whole-output suggestion, so every node still
// offers at least one pill while richer per-field pills come from a live run or a
// user-declared output sample (data-pills roadmap, issues #257 / #259).
export const GENERIC_OUTPUT_SCHEMA: z.ZodTypeAny = z.record(z.unknown());

// Every executable catalog node type (annotations like the sticky note never run
// and produce no output, so they are excluded).
const CATALOG_OUTPUT_TYPES: ReadonlySet<string> = new Set(
  NODE_CATALOG.filter((d) => d.category !== NodeCategory.ANNOTATION).map((d) => d.type),
);

/**
 * Resolve the output schema used to derive data-pill suggestions for a node type.
 *
 * - A concrete, field-bearing schema when one is registered.
 * - The generic whole-output schema for any other *catalog* node type.
 * - `undefined` for types that are not in the catalog at all (so unknown/removed
 *   types contribute no suggestions rather than a misleading pill).
 */
export function getNodeOutputSchema(type: string): z.ZodTypeAny | undefined {
  const concrete = nodeOutputSchemas[type];
  if (concrete) return concrete;
  if (CATALOG_OUTPUT_TYPES.has(type)) return GENERIC_OUTPUT_SCHEMA;
  return undefined;
}
