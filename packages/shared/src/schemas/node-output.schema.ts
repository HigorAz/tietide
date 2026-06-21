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
// caring which provider produced the result. `json` is best-effort: when the model's
// `text` is a JSON object/array it is parsed and exposed so downstream nodes can pill
// its fields directly (e.g. `{{node.json.count}}`) without a Code node; it is absent
// otherwise. Optional and additive — nodes/responses that don't set it are unaffected.
export const aiNodeOutputSchema = z.object({
  text: z.string(),
  json: z.unknown().optional(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  model: z.string(),
  finishReason: z.string().nullable(),
});

// AI: Generate Image output. `imageUrl` is present for the Pollinations provider
// (a public URL usable directly as e.g. an Instagram image_url); `imageBase64` +
// `contentType` are present for Hugging Face (raw bytes, NOT a public URL).
export const aiImageOutputSchema = z.object({
  provider: z.string(),
  prompt: z.string(),
  imageUrl: z.string().optional(),
  imageBase64: z.string().optional(),
  contentType: z.string().optional(),
  model: z.string().optional(),
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

// ── Poll-trigger output schemas (worker-emitted, stable shapes) ──────────────
// Poll triggers in apps/worker/src/nodes/triggers/poll/<name>.ts map provider API
// responses into a fixed item object that becomes the trigger's output payload.
// These shapes are defined in the worker code (the `items.push({...})` / `.map()`),
// so each field below is verified against that emitter — not the raw provider API.

// poll/gmail-label-added.ts — one item per message that gained the label. `headers`
// is the Gmail metadata header map (e.g. From/Subject) keyed by header name.
export const gmailLabelAddedOutputSchema = z.object({
  id: z.string().nullable(),
  threadId: z.string().nullable(),
  labelIds: z.array(z.string()).nullable(),
  snippet: z.string().nullable(),
  headers: z.record(z.string()),
});

// poll/gmail-attachment-received.ts — adds the recursively-collected attachments list.
export const gmailAttachmentReceivedOutputSchema = z.object({
  id: z.string().nullable(),
  threadId: z.string().nullable(),
  labelIds: z.array(z.string()).nullable(),
  snippet: z.string().nullable(),
  headers: z.record(z.string()),
  attachments: z.array(
    z.object({
      attachmentId: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      size: z.number().int().nonnegative(),
    }),
  ),
});

// poll/calendar-event-created.ts — start/end/attendees are passed through opaque
// from the Google Calendar API, so they stay as unknown sub-shapes.
export const calendarEventCreatedOutputSchema = z.object({
  id: z.string().nullable(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  htmlLink: z.string().nullable(),
  start: z.unknown(),
  end: z.unknown(),
  attendees: z.unknown(),
  created: z.string().nullable(),
  updated: z.string().nullable(),
  calendarId: z.string(),
});

// poll/calendar-event-updated.ts — adds status + a derived `cancelled` boolean.
export const calendarEventUpdatedOutputSchema = z.object({
  id: z.string().nullable(),
  status: z.string().nullable(),
  cancelled: z.boolean(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  htmlLink: z.string().nullable(),
  start: z.unknown(),
  end: z.unknown(),
  attendees: z.unknown(),
  created: z.string().nullable(),
  updated: z.string().nullable(),
  calendarId: z.string(),
});

// poll/excel-row-added.ts and poll/excel-row-updated.ts — identical item shape.
// `values` is the Graph table-row 2D cell array (a row is an array of cell-arrays).
export const excelRowOutputSchema = z.object({
  rowIndex: z.number().int(),
  values: z.array(z.array(z.unknown())),
  workbookId: z.string(),
  worksheet: z.string(),
  tableName: z.string(),
});

// poll/notion-database-item-updated.ts — `page` is the raw Notion query result row.
export const notionDatabaseItemUpdatedOutputSchema = z.object({
  id: z.string().nullable(),
  lastEditedTime: z.string().optional(),
  databaseId: z.string(),
  page: z.record(z.unknown()),
});

// poll/airtable-record-created.ts — `fields` is the record's open Airtable field map.
export const airtableRecordCreatedOutputSchema = z.object({
  id: z.string().nullable(),
  fields: z.record(z.unknown()),
  createdTime: z.string().nullable(),
  baseId: z.string(),
  tableIdOrName: z.string(),
});

// poll/linear-issue-updated.ts — `issue` is the raw GraphQL issue node.
export const linearIssueUpdatedOutputSchema = z.object({
  id: z.string().nullable(),
  identifier: z.string().nullable(),
  updatedAt: z.string().nullable(),
  issue: z.record(z.unknown()),
});

// poll/instagram-comment-added.ts — one item per Instagram comment newer than cursor.
export const instagramCommentAddedOutputSchema = z.object({
  id: z.string().nullable(),
  text: z.string().nullable(),
  username: z.string().nullable(),
  timestamp: z.string().nullable(),
  mediaId: z.string(),
});

// poll/s3-object-created.ts — one item per new S3 object under the bucket/prefix.
export const s3ObjectCreatedOutputSchema = z.object({
  key: z.string(),
  size: z.number().int().nonnegative(),
  lastModified: z.string(),
  etag: z.string(),
  bucket: z.string(),
});

// ── GitHub push-trigger output schemas (raw GitHub webhook body) ─────────────
// github-* triggers passthrough the raw GitHub webhook payload, but the shape is
// stable + curated in apps/spa/.../preview/nodeOutputExamples.ts. These mirror
// those exact examples so pills stay consistent; provider-only sub-objects that
// vary widely are kept open. The provider-webhooks layer gates `action === 'opened'`.
export const githubIssueOpenedOutputSchema = z.object({
  action: z.string(),
  issue: z.object({
    number: z.number().int(),
    title: z.string(),
    body: z.string(),
    state: z.string(),
    locked: z.boolean(),
    node_id: z.string(),
    html_url: z.string(),
    labels: z.array(z.object({ id: z.number().int(), name: z.string(), color: z.string() })),
    user: z.object({
      login: z.string(),
      id: z.number().int(),
      html_url: z.string(),
      organizations_url: z.string(),
      subscriptions_url: z.string(),
      received_events_url: z.string(),
    }),
    created_at: z.string(),
    updated_at: z.string(),
  }),
  repository: z.object({
    id: z.number().int(),
    name: z.string(),
    full_name: z.string(),
    owner: z.object({ login: z.string(), id: z.number().int() }),
  }),
  sender: z.object({ login: z.string(), id: z.number().int() }),
});

export const githubPrOpenedOutputSchema = z.object({
  action: z.string(),
  number: z.number().int(),
  pull_request: z.object({
    number: z.number().int(),
    title: z.string(),
    body: z.string(),
    state: z.string(),
    draft: z.boolean(),
    node_id: z.string(),
    html_url: z.string(),
    head: z.object({ ref: z.string(), sha: z.string() }),
    base: z.object({ ref: z.string(), sha: z.string() }),
    user: z.object({ login: z.string(), id: z.number().int() }),
  }),
  repository: z.object({
    id: z.number().int(),
    name: z.string(),
    full_name: z.string(),
    owner: z.object({ login: z.string(), id: z.number().int() }),
  }),
  sender: z.object({ login: z.string(), id: z.number().int() }),
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
  'ai-generate-image': aiImageOutputSchema,
  'gmail-message-received': gmailMessageReceivedOutputSchema,
  'drive-file-added': driveFileAddedOutputSchema,
  'sheets-row-added': sheetsRowAddedOutputSchema,
  'slack-message-received': slackMessageReceivedOutputSchema,
  'discord-message-received': discordMessageReceivedOutputSchema,
  'telegram-message-received': telegramMessageReceivedOutputSchema,
  'twilio-sms-received': twilioSmsReceivedOutputSchema,
  'stripe-event-received': stripeEventReceivedOutputSchema,
  // Poll triggers (worker-emitted, verified item shapes)
  'gmail-label-added': gmailLabelAddedOutputSchema,
  'gmail-attachment-received': gmailAttachmentReceivedOutputSchema,
  'calendar-event-created': calendarEventCreatedOutputSchema,
  'calendar-event-updated': calendarEventUpdatedOutputSchema,
  'excel-row-added': excelRowOutputSchema,
  'excel-row-updated': excelRowOutputSchema,
  'notion-database-item-updated': notionDatabaseItemUpdatedOutputSchema,
  'airtable-record-created': airtableRecordCreatedOutputSchema,
  'linear-issue-updated': linearIssueUpdatedOutputSchema,
  'instagram-comment-added': instagramCommentAddedOutputSchema,
  's3-object-created': s3ObjectCreatedOutputSchema,
  // GitHub push triggers (raw webhook body; mirrors curated NODE_OUTPUT_EXAMPLES)
  'github-issue-opened': githubIssueOpenedOutputSchema,
  'github-pr-opened': githubPrOpenedOutputSchema,
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
