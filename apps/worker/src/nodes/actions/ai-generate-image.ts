import { Injectable, Optional } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';
import {
  aiGenerateImageConfigSchema,
  type AiGenerateImageConfig,
  type HuggingfaceApiKeyConfig,
} from '@tietide/shared';
import { assertUrlAllowed, type LookupFn } from './ssrf-guard';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';
const DEFAULT_HF_BASE = 'https://api-inference.huggingface.co/models';
const DEFAULT_HF_MODEL = 'black-forest-labs/FLUX.1-schnell';

/**
 * AI: Generate Image. A keyless/cheap text-to-image node with two providers:
 *
 * - `pollinations` — free + keyless. We build a deterministic public URL and
 *   return it WITHOUT a network call, so the node never blocks on (or fails
 *   from) Pollinations' best-effort uptime. The URL is usable directly as an
 *   Instagram `image_url`.
 * - `huggingface` — token-based free tier. Requires a `huggingface` connection;
 *   the Inference API returns raw image bytes, which we base64-encode. This is
 *   NOT a public URL, so it can't feed Instagram's publish API without hosting.
 *
 * Image generation does not mutate external state, so the node runs during a
 * dry-run (feeding real data downstream) unless the user opts into `mockOnDryRun`.
 */
@Injectable()
export class AiGenerateImageAction implements INodeExecutor {
  readonly type = 'ai-generate-image';
  readonly name = 'AI: Generate Image';
  readonly description =
    'Generate an image from a text prompt (Pollinations keyless URL, or Hugging Face token)';
  readonly category = 'action' as const;

  private readonly fetchImpl: FetchLike;
  private readonly lookupFn?: LookupFn;

  constructor(@Optional() fetchImpl?: FetchLike, @Optional() lookupFn?: LookupFn) {
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
    this.lookupFn = lookupFn;
  }

  async execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput> {
    const config = aiGenerateImageConfigSchema.parse(input.params);

    if (context.isDryRun && config.mockOnDryRun) {
      return {
        data: { mocked: true, dryRun: true, skipped: true, provider: config.provider },
        metadata: { mocked: true, dryRun: true, skipped: true, nodeType: this.type },
      };
    }

    if (config.provider === 'pollinations') {
      return this.runPollinations(config);
    }
    return this.runHuggingface(config, context);
  }

  private runPollinations(
    config: Extract<AiGenerateImageConfig, { provider: 'pollinations' }>,
  ): NodeOutput {
    const params = new URLSearchParams();
    if (config.width !== undefined) params.set('width', String(config.width));
    if (config.height !== undefined) params.set('height', String(config.height));
    if (config.model !== undefined) params.set('model', config.model);
    if (config.seed !== undefined) params.set('seed', String(config.seed));
    params.set('nologo', 'true');

    const imageUrl = `${POLLINATIONS_BASE}/${encodeURIComponent(config.prompt)}?${params.toString()}`;

    return {
      data: { provider: 'pollinations', prompt: config.prompt, imageUrl, model: config.model },
      metadata: { provider: 'pollinations' },
    };
  }

  private async runHuggingface(
    config: Extract<AiGenerateImageConfig, { provider: 'huggingface' }>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const connection = await context.getConnection<HuggingfaceApiKeyConfig>(config.connectionId);
    // Confused-deputy guard (W5.11): a workflow author can point this node at any
    // connection in their workspace, so verify the resolved connection is really
    // a Hugging Face one before its decrypted token is used.
    if (connection.provider !== 'huggingface') {
      throw new Error(
        `Node "${this.type}" requires a "huggingface" connection, but connection "${config.connectionId}" is a "${connection.provider}" connection`,
      );
    }

    const base = (process.env.HUGGINGFACE_INFERENCE_URL ?? DEFAULT_HF_BASE).replace(/\/+$/, '');
    const model = config.model ?? DEFAULT_HF_MODEL;
    const url = `${base}/${model}`;
    // The HF base is operator/fixed and public, but guard anyway for consistency
    // with the other outbound nodes (and to honor an operator override).
    await assertUrlAllowed(url, this.lookupFn);

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${connection.config.apiKey}`,
        'content-type': 'application/json',
        accept: 'image/png',
      },
      body: JSON.stringify({ inputs: config.prompt }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Hugging Face image generation failed with status ${res.status}: ${detail}`);
    }

    const contentType = res.headers.get('content-type') ?? 'image/png';
    const bytes = Buffer.from(await res.arrayBuffer());

    return {
      data: {
        provider: 'huggingface',
        prompt: config.prompt,
        imageBase64: bytes.toString('base64'),
        contentType,
        model,
      },
      metadata: { provider: 'huggingface', contentType },
    };
  }
}
