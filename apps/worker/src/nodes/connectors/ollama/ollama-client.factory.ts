import { Injectable, Optional } from '@nestjs/common';
import type { DecryptedConnection } from '@tietide/sdk';
import type { OllamaConfig } from '@tietide/shared';
import { assertUrlAllowed, type LookupFn } from '../../actions/ssrf-guard';

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
  // The Ollama baseUrl is fully user-controlled (per-workspace, self-hosted
  // pointer). Without an SSRF guard a workflow author could point it at
  // 169.254.169.254 / RFC1918 / loopback and use the worker as an SSRF proxy.
  // We resolve+validate the URL before every request, matching the http-request
  // node. `lookupFn` is injectable so tests can simulate DNS-based SSRF.
  private readonly lookupFn?: LookupFn;

  constructor(@Optional() lookupFn?: LookupFn) {
    this.lookupFn = lookupFn;
  }

  baseUrl(connection: DecryptedConnection<OllamaConfig>): string {
    return connection.config.baseUrl.replace(/\/+$/, '');
  }

  async generate(
    connection: DecryptedConnection<OllamaConfig>,
    request: OllamaGenerateRequest,
  ): Promise<OllamaGenerateResult> {
    const url = `${this.baseUrl(connection)}/api/generate`;
    await this.assertAllowed(url);
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
    await this.assertAllowed(url);
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

  private async assertAllowed(url: string): Promise<void> {
    await assertUrlAllowed(url, this.lookupFn);
  }
}
