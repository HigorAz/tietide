import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import type { DecryptedConnection } from '@tietide/sdk';
import type { OpenAIApiKeyConfig } from '@tietide/shared';

export interface OpenaiChatRequest {
  model: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
}

export interface OpenaiChatResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  finishReason: string | null;
}

@Injectable()
export class OpenaiClientFactory {
  buildClient(connection: DecryptedConnection<OpenAIApiKeyConfig>): OpenAI {
    return new OpenAI({
      apiKey: connection.config.apiKey,
      ...(connection.config.organization ? { organization: connection.config.organization } : {}),
    });
  }

  async createChatCompletion(
    connection: DecryptedConnection<OpenAIApiKeyConfig>,
    request: OpenaiChatRequest,
  ): Promise<OpenaiChatResponse> {
    const client = this.buildClient(connection);

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (request.system) messages.push({ role: 'system', content: request.system });
    messages.push({ role: 'user', content: request.prompt });

    const response = await client.chat.completions.create({
      model: request.model,
      messages,
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
    });

    const choice = response.choices[0];
    const text = choice?.message?.content ?? '';

    return {
      text,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      model: response.model,
      finishReason: choice?.finish_reason ?? null,
    };
  }
}
