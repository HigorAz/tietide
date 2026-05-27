import { Injectable } from '@nestjs/common';
import type { DecryptedConnection } from '@tietide/sdk';
import type { OllamaConfig } from '@tietide/shared';

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
}

export interface OllamaGenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  finishReason: string | null;
}

export interface OllamaEmbeddingsRequest {
  model: string;
  prompt: string;
}

export interface OllamaEmbeddingsResult {
  embedding: number[];
  dimensions: number;
  model: string;
}

interface OllamaEmbeddingsApiResponse {
  embedding?: number[];
}

interface OllamaApiResponse {
  response?: string;
  model?: string;
  done?: boolean;
  done_reason?: string;
  eval_count?: number;
  prompt_eval_count?: number;
}

export class OllamaHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Ollama request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class OllamaClientFactory {
  baseUrl(connection: DecryptedConnection<OllamaConfig>): string {
    return connection.config.baseUrl.replace(/\/+$/, '');
  }

  async generate(
    connection: DecryptedConnection<OllamaConfig>,
    request: OllamaGenerateRequest,
  ): Promise<OllamaGenerateResult> {
    const url = `${this.baseUrl(connection)}/api/generate`;
    const body = {
      model: request.model,
      prompt: request.prompt,
      stream: false,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });

    let parsed: OllamaApiResponse | null = null;
    try {
      parsed = (await res.json()) as OllamaApiResponse;
    } catch {
      parsed = null;
    }

    if (res.status >= 400) {
      throw new OllamaHttpError(res.status, parsed);
    }

    return {
      text: parsed?.response ?? '',
      inputTokens: parsed?.prompt_eval_count ?? 0,
      outputTokens: parsed?.eval_count ?? 0,
      model: parsed?.model ?? request.model,
      finishReason: parsed?.done_reason ?? null,
    };
  }

  async embeddings(
    connection: DecryptedConnection<OllamaConfig>,
    request: OllamaEmbeddingsRequest,
  ): Promise<OllamaEmbeddingsResult> {
    const url = `${this.baseUrl(connection)}/api/embeddings`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ model: request.model, prompt: request.prompt }),
    });

    let parsed: OllamaEmbeddingsApiResponse | null = null;
    try {
      parsed = (await res.json()) as OllamaEmbeddingsApiResponse;
    } catch {
      parsed = null;
    }

    if (res.status >= 400) {
      throw new OllamaHttpError(res.status, parsed);
    }

    const embedding = parsed?.embedding ?? [];
    return { embedding, dimensions: embedding.length, model: request.model };
  }
}
