import { Injectable } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 30_000;

interface ParsedParams {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
}

@Injectable()
export class HttpRequestAction implements INodeExecutor {
  readonly type = 'http-request';
  readonly name = 'HTTP Request';
  readonly description = 'Performs a configurable HTTP request and returns the response';
  readonly category = 'action' as const;

  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl?: FetchLike) {
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
  }

  async execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput> {
    const params = this.parseParams(input.params);
    const hasBody = this.shouldSendBody(params);
    const headers = this.buildHeaders(params, hasBody);
    const body = hasBody ? this.serializeBody(params.body) : undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    const started = Date.now();

    let response: Response;
    try {
      response = await this.fetchImpl(params.url, {
        method: params.method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      const error = err as Error;
      if (error.name === 'AbortError') {
        throw new Error(`HTTP request timed out after ${params.timeoutMs}ms`);
      }
      throw new Error(`HTTP request failed: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }

    const duration = Date.now() - started;
    const responseHeaders = this.headersToObject(response.headers);
    const responseBody = await this.parseBody(response);

    if (!response.ok) {
      context.logger.warn('HTTP request returned non-2xx status', {
        status: response.status,
        url: params.url,
      });
      throw new Error(`HTTP request returned status ${response.status}`);
    }

    return {
      data: {
        statusCode: response.status,
        headers: responseHeaders,
        body: responseBody,
        duration,
      },
      metadata: {
        statusCode: response.status,
        duration,
      },
    };
  }

  private parseParams(raw: Record<string, unknown>): ParsedParams {
    const url = raw.url;
    if (typeof url !== 'string' || url.length === 0) {
      throw new Error('HTTP request requires a non-empty "url" parameter');
    }

    const method =
      typeof raw.method === 'string' && raw.method.length > 0 ? raw.method.toUpperCase() : 'GET';

    const headers: Record<string, string> = {};
    if (raw.headers && typeof raw.headers === 'object' && !Array.isArray(raw.headers)) {
      for (const [key, value] of Object.entries(raw.headers as Record<string, unknown>)) {
        if (typeof value === 'string') {
          headers[key.toLowerCase()] = value;
        }
      }
    }

    const timeoutMs =
      typeof raw.timeout === 'number' && Number.isFinite(raw.timeout) && raw.timeout > 0
        ? raw.timeout
        : DEFAULT_TIMEOUT_MS;

    return { method, url, headers, body: raw.body, timeoutMs };
  }

  private shouldSendBody(params: ParsedParams): boolean {
    if (params.body === undefined || params.body === null) return false;
    return params.method !== 'GET' && params.method !== 'HEAD';
  }

  private serializeBody(body: unknown): string {
    return typeof body === 'string' ? body : JSON.stringify(body);
  }

  private buildHeaders(params: ParsedParams, hasBody: boolean): Record<string, string> {
    const headers = { ...params.headers };
    if (hasBody && typeof params.body !== 'string' && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }
    return headers;
  }

  private headersToObject(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }

  private async parseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    if (text.length === 0) return '';
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return text;
  }
}
