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
