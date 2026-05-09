import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { DecryptedConnection } from '@tietide/sdk';
import type { AnthropicApiKeyConfig } from '@tietide/shared';

export interface ClaudeMessageRequest {
  model: string;
  prompt: string;
  system?: string;
  maxTokens: number;
  enablePromptCaching: boolean;
}

export interface ClaudeMessageResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  stopReason: string | null;
}

@Injectable()
export class ClaudeClientFactory {
  // Build a fresh SDK client per request — connections may be re-keyed between
  // executions, and the SDK client carries the api key in closure.
  buildClient(connection: DecryptedConnection<AnthropicApiKeyConfig>): Anthropic {
    return new Anthropic({ apiKey: connection.config.apiKey });
  }

  async createMessage(
    connection: DecryptedConnection<AnthropicApiKeyConfig>,
    request: ClaudeMessageRequest,
  ): Promise<ClaudeMessageResponse> {
    const client = this.buildClient(connection);

    // System prompt shaping. When prompt caching is on we send the system field
    // as a content-block array with cache_control: ephemeral (Anthropic's
    // documented format); otherwise a plain string. When `system` is absent we
    // omit the field entirely.
    const systemField = request.system
      ? request.enablePromptCaching
        ? [
            {
              type: 'text' as const,
              text: request.system,
              cache_control: { type: 'ephemeral' as const },
            },
          ]
        : request.system
      : undefined;

    const response = await client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      ...(systemField !== undefined ? { system: systemField } : {}),
      messages: [{ role: 'user', content: request.prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : '';

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
      stopReason: response.stop_reason ?? null,
    };
  }
}
