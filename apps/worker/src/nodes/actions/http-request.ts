import { Injectable, Optional } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';
import { httpRequestOutputSchema, type HttpConnectionConfig } from '@tietide/shared';
import { assertUrlAllowed, type LookupFn } from './ssrf-guard';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 30_000;
// Cap the response we buffer + persist to ExecutionStep.outputData. Prevents a
// large/malicious endpoint from OOMing the worker or bloating Postgres JSONB.
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MiB

interface ParsedParams {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  mockOnDryRun: boolean;
}

@Injectable()
export class HttpRequestAction implements INodeExecutor {
  readonly type = 'http-request';
  readonly name = 'HTTP Request';
  readonly description = 'Performs a configurable HTTP request and returns the response';
  readonly category = 'action' as const;
  readonly outputSchema = httpRequestOutputSchema;

  private readonly fetchImpl: FetchLike;
  private readonly lookupFn?: LookupFn;

  constructor(@Optional() fetchImpl?: FetchLike, @Optional() lookupFn?: LookupFn) {
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
    this.lookupFn = lookupFn;
  }

  async execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput> {
    const params = this.parseParams(input.params);
    const hasBody = this.shouldSendBody(params);
    // Resolve optional connection auth BEFORE the dry-run branch so the preview
    // reflects what would actually be sent (a stale connectionId throws here,
    // which is the correct fail-fast behavior even on a dry run).
    const authHeaders = await this.resolveAuthHeaders(input, context);
    // Connection-provided auth wins over a manually-typed header of the same
    // key — selecting a connection is the explicit authentication intent.
    const headers = { ...this.buildHeaders(params, hasBody), ...authHeaders };
    const body = hasBody ? this.serializeBody(params.body) : undefined;

    // Safe-by-default dry-run guard: never perform a *mutating* HTTP request
    // (POST/PUT/PATCH/DELETE/...) during a test run. Read-only methods (GET/HEAD)
    // still execute so downstream nodes get real data — unless the user
    // explicitly opts into a mock via mockOnDryRun.
    const isReadOnly = params.method === 'GET' || params.method === 'HEAD';
    if (context.isDryRun && (!isReadOnly || params.mockOnDryRun)) {
      return {
        data: {
          mocked: true,
          dryRun: true,
          skipped: true,
          wouldHaveSent: {
            method: params.method,
            url: params.url,
            // Redact connection-injected secrets so they never land in the
            // persisted ExecutionStep.outputData.
            headers: this.redactAuthHeaders(headers, authHeaders),
            body: hasBody ? params.body : undefined,
          },
        },
        metadata: { mocked: true, dryRun: true, skipped: true },
      };
    }

    // SSRF guard: validate scheme + reject private/loopback/link-local/metadata
    // targets BEFORE connecting. Runs on the post-template-resolution URL.
    await assertUrlAllowed(params.url, this.lookupFn);

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

    const mockOnDryRun = raw.mockOnDryRun === true;

    return { method, url, headers, body: raw.body, timeoutMs, mockOnDryRun };
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

  // Fetches the optionally-selected HTTP connection and turns its stored
  // credential into request headers. Returns {} when the node has no
  // connectionId so unauthenticated requests are unaffected. Header keys are
  // lowercased to match parseParams so they reliably override manual headers.
  private async resolveAuthHeaders(
    input: NodeInput,
    context: ExecutionContext,
  ): Promise<Record<string, string>> {
    const connectionId = input.connectionId;
    if (typeof connectionId !== 'string' || connectionId.length === 0) {
      return {};
    }

    const connection = await context.getConnection<HttpConnectionConfig>(connectionId);
    const config = connection.config;

    switch (config.authType) {
      case 'bearer':
        return { authorization: `Bearer ${config.token}` };
      case 'apiKey':
        return { [config.headerName.toLowerCase()]: config.apiKey };
      case 'basic': {
        const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64');
        return { authorization: `Basic ${encoded}` };
      }
      default:
        return {};
    }
  }

  // Masks the value of any header that was injected from a connection so the
  // dry-run preview never persists the decrypted secret. Preserves the auth
  // scheme prefix (Bearer/Basic) for readability.
  private redactAuthHeaders(
    headers: Record<string, string>,
    authHeaders: Record<string, string>,
  ): Record<string, string> {
    const redacted = { ...headers };
    for (const key of Object.keys(authHeaders)) {
      const value = redacted[key];
      if (typeof value !== 'string') continue;
      const [scheme] = value.split(' ');
      redacted[key] = scheme === 'Bearer' || scheme === 'Basic' ? `${scheme} ***` : '***';
    }
    return redacted;
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
    const text = await this.readTextCapped(response);
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

  // Reads the response body but aborts once MAX_RESPONSE_BYTES is exceeded, so a
  // huge/streaming response can't exhaust worker memory or bloat the DB.
  private async readTextCapped(response: Response): Promise<string> {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      throw new Error(`HTTP response exceeds ${MAX_RESPONSE_BYTES} byte limit`);
    }
    const body = response.body;
    if (!body) return '';
    const reader = body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_RESPONSE_BYTES) {
            throw new Error(`HTTP response exceeds ${MAX_RESPONSE_BYTES} byte limit`);
          }
          chunks.push(Buffer.from(value));
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
