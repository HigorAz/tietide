import { isIP } from 'net';
import { Agent } from 'undici';
import { Injectable, Optional } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';
import { httpRequestOutputSchema, type HttpConnectionConfig } from '@tietide/shared';
import { assertUrlAllowedWithAddresses, SsrfBlockedError, type LookupFn } from './ssrf-guard';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// Node `net`-style lookup callback. With `options.all` the result is an array of
// `{ address, family }`; otherwise a single `(address, family)` pair.
type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;
type PinnedLookup = (
  hostname: string,
  options: { all?: boolean } | number,
  callback: LookupCallback,
) => void;

// Factory that turns the SSRF-validated address set into a fetch `dispatcher`.
// Injectable so tests can observe exactly which addresses the request is pinned
// to without standing up a real undici Agent / socket.
export type DispatcherFactory = (opts: { addresses: string[]; servername: string }) => unknown;

const familyOf = (address: string): number => (isIP(address) === 6 ? 6 : 4);

/**
 * Build a synchronous, real-DNS-free lookup that ALWAYS resolves to the
 * pre-validated addresses, ignoring the hostname it is asked about. undici calls
 * this at socket-connect time, so a TTL-0 rebinding record that would return a
 * private IP is never consulted — closing the validate-vs-connect TOCTOU (W5.6).
 */
export function buildPinnedLookup(addresses: string[]): PinnedLookup {
  const pinned = addresses.map((address) => ({ address, family: familyOf(address) }));
  return (_hostname, options, callback) => {
    const wantsAll = typeof options === 'object' && options !== null && options.all === true;
    if (wantsAll) {
      callback(null, pinned);
      return;
    }
    callback(null, pinned[0].address, pinned[0].family);
  };
}

// Default dispatcher factory: an undici Agent whose connector resolves only to
// the validated addresses. `servername` is forced to the original hostname so
// TLS SNI / cert validation still target the real host (we only swap the IP).
const defaultDispatcherFactory: DispatcherFactory = ({ addresses, servername }) =>
  new Agent({ connect: { lookup: buildPinnedLookup(addresses), servername } });

const DEFAULT_TIMEOUT_MS = 30_000;
// Hard upper bound on the per-call timeout, mirroring httpRequestConfigSchema's
// .max(30000). Concurrency is 5, so an unbounded timeout could hold a shared
// worker slot for hours; clamp here since node config bypasses the Zod schema.
const MAX_TIMEOUT_MS = 30_000;
// Cap the response we buffer + persist to ExecutionStep.outputData. Prevents a
// large/malicious endpoint from OOMing the worker or bloating Postgres JSONB.
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MiB
// Bound the number of redirects we follow manually. undici would follow up to 20
// automatically, but we must re-run the SSRF guard on EVERY hop, so we drive the
// loop ourselves and refuse to chase more than this many redirects.
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class TooManyRedirectsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TooManyRedirectsError';
  }
}

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
  private readonly dispatcherFactory: DispatcherFactory;

  constructor(
    @Optional() fetchImpl?: FetchLike,
    @Optional() lookupFn?: LookupFn,
    @Optional() dispatcherFactory?: DispatcherFactory,
  ) {
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
    this.lookupFn = lookupFn;
    this.dispatcherFactory = dispatcherFactory ?? defaultDispatcherFactory;
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

    // SSRF guard runs inside fetchFollowingRedirects: the initial URL and every
    // redirect hop are validated AND the connection is pinned to the validated
    // address(es), so neither the initial fetch nor any hop can be DNS-rebound to
    // a private/metadata IP at connect time (W5.6).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    const started = Date.now();

    let response: Response;
    try {
      response = await this.fetchFollowingRedirects(
        params.url,
        { method: params.method, headers, body, signal: controller.signal },
        authHeaders,
      );
    } catch (err) {
      const error = err as Error;
      // SSRF rejections (initial URL or a redirect hop) and the redirect-cap
      // error are surfaced verbatim — they are the security signal, not a
      // transport failure.
      if (error.name === 'SsrfBlockedError' || error.name === 'TooManyRedirectsError') {
        throw error;
      }
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

    // Clamp to MAX_TIMEOUT_MS (mirrors httpRequestConfigSchema's .max()). The
    // node config reaches us as z.record(z.unknown()), so a definition saved via
    // PATCH that bypasses the SPA could otherwise pin a worker slot indefinitely.
    const rawTimeout =
      typeof raw.timeout === 'number' && Number.isFinite(raw.timeout) && raw.timeout > 0
        ? raw.timeout
        : DEFAULT_TIMEOUT_MS;
    const timeoutMs = Math.min(rawTimeout, MAX_TIMEOUT_MS);

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

  // Manual redirect loop. undici (and the WHATWG fetch default) would follow up
  // to 20 redirects WITHOUT re-running the SSRF guard, so a public attacker host
  // could 302 the worker to http://169.254.169.254/ or an internal service and
  // the internal response would be persisted. Instead we pass `redirect: manual`
  // and drive the hops ourselves: re-validate every URL (initial + each Location)
  // with the SSRF guard and PIN the connection to the validated address(es)
  // (W5.6 — defeats DNS rebinding) before re-fetching, and strip the
  // Authorization header (and any connection-injected auth) when a redirect
  // crosses origin so credentials never leak to a different host.
  private async fetchFollowingRedirects(
    initialUrl: string,
    init: RequestInit & { headers: Record<string, string> },
    authHeaders: Record<string, string>,
  ): Promise<Response> {
    let currentUrl = initialUrl;
    let headers = init.headers;

    for (let hop = 0; ; hop += 1) {
      // Validate THIS hop and capture the exact addresses to pin. Throws
      // SsrfBlockedError before any socket is opened if the target is internal.
      const allowed = await assertUrlAllowedWithAddresses(currentUrl, this.lookupFn);

      // Literal-IP hosts have no DNS to rebind, so no dispatcher is needed; the
      // guard already proved the literal is public. For hostnames, build a
      // dispatcher that pins the socket to the just-validated addresses so undici
      // cannot re-resolve (and be rebound) at connect time.
      const dispatcher = allowed.isLiteralIp
        ? undefined
        : this.dispatcherFactory({
            addresses: allowed.addresses,
            servername: allowed.url.hostname,
          });

      const response = await this.fetchImpl(currentUrl, {
        ...init,
        headers,
        redirect: 'manual',
        ...(dispatcher !== undefined ? { dispatcher } : {}),
      } as RequestInit);

      const location = response.headers.get('location');
      if (!REDIRECT_STATUSES.has(response.status) || !location) {
        return response;
      }

      if (hop >= MAX_REDIRECTS) {
        throw new TooManyRedirectsError(`HTTP request exceeded ${MAX_REDIRECTS} redirects`);
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new SsrfBlockedError('Invalid redirect Location');
      }

      // Drop the Authorization header and any connection-injected auth header
      // when the redirect crosses origin (scheme + host + port).
      if (nextUrl.origin !== new URL(currentUrl).origin) {
        headers = this.stripAuthHeaders(headers, authHeaders);
      }

      currentUrl = nextUrl.toString();
    }
  }

  // Returns a copy of `headers` with the Authorization header and every
  // connection-injected auth header removed, so cross-origin redirects don't
  // leak credentials to an attacker-controlled host.
  private stripAuthHeaders(
    headers: Record<string, string>,
    authHeaders: Record<string, string>,
  ): Record<string, string> {
    const stripped = { ...headers };
    delete stripped['authorization'];
    for (const key of Object.keys(authHeaders)) {
      delete stripped[key.toLowerCase()];
    }
    return stripped;
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
