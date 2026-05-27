import { z } from 'zod';

const connectionId = z.string().uuid();
const promptText = z.string().min(1).max(50_000);
const systemText = z.string().max(50_000);

// OpenAI Chat Completions API config. Default model targets a current GA chat
// model; `model` is free-text so users can pin to gpt-4-turbo, gpt-4o-mini,
// or future model ids without a code change.
export const openaiChatCompletionConfigSchema = z.object({
  connectionId,
  model: z.string().min(1).max(128).default('gpt-4o'),
  system: systemText.optional(),
  prompt: promptText,
  maxTokens: z.number().int().min(1).max(8192).optional(),
  mockOnDryRun: z.boolean().optional(),
});

export type OpenaiChatCompletionConfig = z.infer<typeof openaiChatCompletionConfigSchema>;

// --- S15 commerce/data/storage read/update pack (#246): AI enrichment ---

export const openaiEmbeddingsConfigSchema = z.object({
  connectionId,
  model: z.string().min(1).max(128).default('text-embedding-3-small'),
  input: z.string().min(1).max(8192),
  mockOnDryRun: z.boolean().optional(),
});
export type OpenaiEmbeddingsConfig = z.infer<typeof openaiEmbeddingsConfigSchema>;

export const OPENAI_IMAGE_SIZES = [
  '256x256',
  '512x512',
  '1024x1024',
  '1792x1024',
  '1024x1792',
] as const;
export const openaiGenerateImageConfigSchema = z.object({
  connectionId,
  model: z.string().min(1).max(128).default('dall-e-3'),
  prompt: z.string().min(1).max(4000),
  size: z.enum(OPENAI_IMAGE_SIZES).default('1024x1024'),
  count: z.number().int().min(1).max(4).default(1),
  mockOnDryRun: z.boolean().optional(),
});
export type OpenaiGenerateImageConfig = z.infer<typeof openaiGenerateImageConfigSchema>;
