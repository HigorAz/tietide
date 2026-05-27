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

export interface OpenaiEmbeddingsRequest {
  model: string;
  input: string;
}

export interface OpenaiEmbeddingsResponse {
  embedding: number[];
  dimensions: number;
  inputTokens: number;
  model: string;
}

export interface OpenaiImageRequest {
  model: string;
  prompt: string;
  size: string;
  count: number;
}

export interface OpenaiImageResponse {
  images: Array<{ url: string | null; b64Json: string | null }>;
  model: string;
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

  async createEmbeddings(
    connection: DecryptedConnection<OpenAIApiKeyConfig>,
    request: OpenaiEmbeddingsRequest,
  ): Promise<OpenaiEmbeddingsResponse> {
    const client = this.buildClient(connection);
    const response = await client.embeddings.create({
      model: request.model,
      input: request.input,
    });

    const embedding = response.data[0]?.embedding ?? [];
    return {
      embedding,
      dimensions: embedding.length,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      model: response.model,
    };
  }

  async createImage(
    connection: DecryptedConnection<OpenAIApiKeyConfig>,
    request: OpenaiImageRequest,
  ): Promise<OpenaiImageResponse> {
    const client = this.buildClient(connection);
    const response = await client.images.generate({
      model: request.model,
      prompt: request.prompt,
      size: request.size as OpenAI.ImageGenerateParams['size'],
      n: request.count,
    });

    const images = (response.data ?? []).map((img) => ({
      url: img.url ?? null,
      b64Json: img.b64_json ?? null,
    }));
    return { images, model: request.model };
  }
}
