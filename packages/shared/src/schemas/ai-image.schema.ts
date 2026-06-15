import { z } from 'zod';

const prompt = z.string().min(1).max(2000);
const dimension = z.number().int().min(64).max(2048);

/**
 * AI: Generate Image node config. A discriminated union over the image provider:
 *
 * - `pollinations` — free, keyless. The node builds a deterministic public image
 *   URL (`https://image.pollinations.ai/prompt/{prompt}`) usable directly as an
 *   Instagram `image_url`. No connection required.
 * - `huggingface` — token-based free tier. Requires a `huggingface` connection;
 *   the Inference API returns raw image bytes (base64), NOT a public URL, so its
 *   output is not directly usable by Instagram without a separate hosting step.
 */
export const aiGenerateImageConfigSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('pollinations'),
    prompt,
    width: dimension.optional(),
    height: dimension.optional(),
    model: z.string().min(1).max(64).optional(),
    seed: z.number().int().min(0).max(4_294_967_295).optional(),
    mockOnDryRun: z.boolean().optional(),
  }),
  z.object({
    provider: z.literal('huggingface'),
    connectionId: z.string().uuid(),
    prompt,
    model: z.string().min(1).max(128).optional(),
    mockOnDryRun: z.boolean().optional(),
  }),
]);

export type AiGenerateImageConfig = z.infer<typeof aiGenerateImageConfigSchema>;
