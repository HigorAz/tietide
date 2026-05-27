import { z } from 'zod';

const connectionId = z.string().uuid();
const promptText = z.string().min(1).max(50_000);
const systemText = z.string().max(50_000);

// Claude Messages API config. The default model is the current Sonnet snapshot;
// users can override to pin a specific Anthropic model id (e.g. claude-opus-4-7).
// `enablePromptCaching` opts the system prompt into Anthropic's ephemeral prompt
// cache; the action wraps the system field in a content block array with
// `cache_control: { type: 'ephemeral' }` when this flag is true. Note that
// Anthropic only writes to the cache when the cached prefix exceeds the model's
// minimum size (~1024 tokens for Sonnet), below that the marker is silently
// ignored — set `enablePromptCaching` only on workflows with substantial
// reusable system prompts.
export const claudeMessagesConfigSchema = z.object({
  connectionId,
  model: z.string().min(1).max(128).default('claude-sonnet-4-6'),
  system: systemText.optional(),
  prompt: promptText,
  maxTokens: z.number().int().min(1).max(8192).default(1024),
  enablePromptCaching: z.boolean().default(false),
  mockOnDryRun: z.boolean().optional(),
});

export type ClaudeMessagesConfig = z.infer<typeof claudeMessagesConfigSchema>;

// --- S15 commerce/data/storage read/update pack (#246): AI enrichment ---

export const ANTHROPIC_VISION_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

// Claude vision: analyze an image (by URL or base64) with a text prompt. Provide
// exactly one image source; base64 input also requires its mediaType.
export const anthropicVisionConfigSchema = z
  .object({
    connectionId,
    model: z.string().min(1).max(128).default('claude-sonnet-4-6'),
    prompt: promptText,
    imageUrl: z.string().url().max(2048).optional(),
    imageBase64: z.string().min(1).max(7_000_000).optional(),
    mediaType: z.enum(ANTHROPIC_VISION_MEDIA_TYPES).optional(),
    maxTokens: z.number().int().min(1).max(8192).default(1024),
    mockOnDryRun: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.imageUrl) !== Boolean(v.imageBase64), {
    message: 'provide exactly one of imageUrl or imageBase64',
    path: ['imageUrl'],
  })
  .refine((v) => !v.imageBase64 || Boolean(v.mediaType), {
    message: 'mediaType is required for base64 images',
    path: ['mediaType'],
  });
export type AnthropicVisionConfig = z.infer<typeof anthropicVisionConfigSchema>;
