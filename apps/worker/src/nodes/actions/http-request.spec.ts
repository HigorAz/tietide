import type { ExecutionContext, NodeInput } from '@tietide/sdk';
import {
  buildPinnedLookup,
  HttpRequestAction,
  type DispatcherFactory,
  type FetchLike,
} from './http-request';
import type { LookupFn } from './ssrf-guard';

const mockFetch = (impl: FetchLike) => jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(impl);

// Stub DNS so test hostnames (api.test, no-such-host.invalid) resolve to a
// public address and pass the SSRF guard without real network lookups.
const stubLookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];

const slowFetch = () =>
  mockFetch(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      }),
  );

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext =>
  ({
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    getSecret: jest.fn(async () => 'secret-value'),
    getConnection: jest.fn(async () => ({
      id: 'conn-stub',
      type: 'OAUTH2',
      provider: 'stub',
      config: {},
    })),
    markConnectionForRefresh: jest.fn(async () => undefined),
    ...overrides,
  }) as unknown as ExecutionContext;

const makeInput = (
  params: Record<string, unknown>,
  data: Record<string, unknown> = {},
): NodeInput => ({
  data,
  params,
});

const connInputAuth = (params: Record<string, unknown>, connectionId: string): NodeInput => ({
  data: {},
  params,
  connectionId,
});

const jsonResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const textResponse = (
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/plain', ...headers },
  });

describe('HttpRequestAction', () => {
  describe('interface metadata', () => {
    it('should expose the http-request type', () => {
      const action = new HttpRequestAction(undefined, stubLookup);
      expect(action.type).toBe('http-request');
    });

    it('should expose a human-readable name and description', () => {
      const action = new HttpRequestAction(undefined, stubLookup);
      expect(action.name).toBe('HTTP Request');
      expect(typeof action.description).toBe('string');
      expect(action.description.length).toBeGreaterThan(0);
    });

    it('should be categorized as an action', () => {
      const action = new HttpRequestAction(undefined, stubLookup);
      expect(action.category).toBe('action');
    });
  });

  describe('execute — GET request', () => {
    it('should return response body, statusCode, headers and duration for a 200 GET', async () => {
      const fetchMock = mockFetch(async () =>
        jsonResponse(200, { ok: true, count: 3 }, { 'x-custom': 'abc' }),
      );
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action.execute(
        makeInput({ method: 'GET', url: 'https://api.test/items' }),
        makeContext(),
      );

      expect(result.data.statusCode).toBe(200);
      expect(result.data.body).toEqual({ ok: true, count: 3 });
      expect(result.data.headers).toMatchObject({
        'content-type': 'application/json',
        'x-custom': 'abc',
      });
      expect(typeof result.data.duration).toBe('number');
      expect(result.data.duration).toBeGreaterThanOrEqual(0);
    });

    it('should pass method and url to fetch and omit body for GET', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await action.execute(
        makeInput({ method: 'GET', url: 'https://api.test/ping' }),
        makeContext(),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test/ping');
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
    });

    it('should default to GET when method is not provided', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await action.execute(makeInput({ url: 'https://api.test/' }), makeContext());

      expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
    });

    it('should parse plain-text responses as string bodies', async () => {
      const fetchMock = mockFetch(async () => textResponse(200, 'hello'));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action.execute(
        makeInput({ method: 'GET', url: 'https://api.test/txt' }),
        makeContext(),
      );

      expect(result.data.body).toBe('hello');
    });
  });

  describe('execute — POST request', () => {
    it('should send JSON body and return the response', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(201, { id: 'new-123' }));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action.execute(
        makeInput({
          method: 'POST',
          url: 'https://api.test/items',
          body: { name: 'widget', qty: 2 },
        }),
        makeContext(),
      );

      const [, init] = fetchMock.mock.calls[0];
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({ name: 'widget', qty: 2 }));
      expect(result.data.statusCode).toBe(201);
      expect(result.data.body).toEqual({ id: 'new-123' });
    });

    it('should set Content-Type: application/json when body is an object and header is not provided', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await action.execute(
        makeInput({ method: 'POST', url: 'https://api.test/x', body: { a: 1 } }),
        makeContext(),
      );

      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['content-type']).toBe('application/json');
    });

    it('should send string body verbatim without stringifying it', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await action.execute(
        makeInput({ method: 'POST', url: 'https://api.test/x', body: 'raw-string-payload' }),
        makeContext(),
      );

      expect(fetchMock.mock.calls[0][1]?.body).toBe('raw-string-payload');
    });

    it('should merge custom headers with generated ones', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await action.execute(
        makeInput({
          method: 'POST',
          url: 'https://api.test/x',
          headers: { authorization: 'Bearer token-xyz' },
          body: { a: 1 },
        }),
        makeContext(),
      );

      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers.authorization).toBe('Bearer token-xyz');
      expect(headers['content-type']).toBe('application/json');
    });
  });

  describe('execute — timeout', () => {
    it('should abort the request and throw when the configured timeout elapses', async () => {
      const fetchMock = slowFetch();
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await expect(
        action.execute(
          makeInput({ method: 'GET', url: 'https://api.test/slow', timeout: 40 }),
          makeContext(),
        ),
      ).rejects.toThrow(/timed out/i);
    });

    it('should clamp an oversized timeout to the 30-second cap', async () => {
      jest.useFakeTimers();
      try {
        const fetchMock = slowFetch();
        const action = new HttpRequestAction(fetchMock, stubLookup);

        const promise = action
          .execute(
            makeInput({ method: 'GET', url: 'https://api.test/slow', timeout: 3_600_000 }),
            makeContext(),
          )
          .catch((e: unknown) => e as Error);

        // advanceTimersByTimeAsync flushes the SSRF DNS-lookup microtask first,
        // so the abort timer is scheduled before we advance past it.
        await jest.advanceTimersByTimeAsync(29_999);
        let settled = false;
        void promise.then(() => (settled = true));
        await Promise.resolve();
        expect(settled).toBe(false);

        // Past the 30s cap the request must abort — the raw 3.6M ms is ignored.
        await jest.advanceTimersByTimeAsync(2);
        const result = await promise;
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toMatch(/timed out after 30000ms/i);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should use a 30-second default timeout when none is provided', async () => {
      jest.useFakeTimers();
      try {
        const fetchMock = slowFetch();
        const action = new HttpRequestAction(fetchMock, stubLookup);

        const promise = action
          .execute(makeInput({ method: 'GET', url: 'https://api.test/slow' }), makeContext())
          .catch((e: unknown) => e as Error);

        // advanceTimersByTimeAsync flushes the SSRF DNS-lookup microtask first,
        // so the abort timer is scheduled before we advance past it.
        await jest.advanceTimersByTimeAsync(29_999);
        let settled = false;
        void promise.then(() => (settled = true));
        await Promise.resolve();
        expect(settled).toBe(false);

        await jest.advanceTimersByTimeAsync(2);
        const result = await promise;
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toMatch(/timed out/i);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('execute — error handling', () => {
    it('should throw when the response status is >= 400', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(404, { error: 'not found' }));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await expect(
        action.execute(
          makeInput({ method: 'GET', url: 'https://api.test/missing' }),
          makeContext(),
        ),
      ).rejects.toThrow(/status 404/);
    });

    it('should throw when the response status is >= 500', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(503, { error: 'boom' }));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await expect(
        action.execute(makeInput({ method: 'GET', url: 'https://api.test/down' }), makeContext()),
      ).rejects.toThrow(/status 503/);
    });

    it('should wrap network errors in a descriptive Error', async () => {
      const fetchMock = mockFetch(async () => {
        throw new TypeError('fetch failed: ENOTFOUND');
      });
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await expect(
        action.execute(
          makeInput({ method: 'GET', url: 'https://no-such-host.invalid/' }),
          makeContext(),
        ),
      ).rejects.toThrow(/HTTP request failed/);
    });
  });

  describe('execute — validation', () => {
    it('should throw when url is missing', async () => {
      const action = new HttpRequestAction(
        mockFetch(async () => jsonResponse(200, {})),
        stubLookup,
      );

      await expect(action.execute(makeInput({ method: 'GET' }), makeContext())).rejects.toThrow(
        /url/i,
      );
    });

    it('should throw when url is not a string', async () => {
      const action = new HttpRequestAction(
        mockFetch(async () => jsonResponse(200, {})),
        stubLookup,
      );

      await expect(
        action.execute(makeInput({ method: 'GET', url: 123 }), makeContext()),
      ).rejects.toThrow(/url/i);
    });
  });

  describe('execute — dry-run mocking', () => {
    it('should return a mock response without invoking fetch when isDryRun + mockOnDryRun', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action.execute(
        makeInput({
          method: 'POST',
          url: 'https://api.real-side-effect.test/orders',
          body: { sku: 'SKU-1' },
          mockOnDryRun: true,
        }),
        makeContext({ isDryRun: true }),
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.data).toEqual(
        expect.objectContaining({
          mocked: true,
          wouldHaveSent: expect.objectContaining({
            method: 'POST',
            url: 'https://api.real-side-effect.test/orders',
            body: { sku: 'SKU-1' },
          }),
        }),
      );
      expect(result.metadata).toEqual(expect.objectContaining({ mocked: true }));
    });

    it('should still call fetch on dry-run when mockOnDryRun is absent (matches Zapier/n8n)', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, { ok: true }));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action.execute(
        makeInput({ method: 'GET', url: 'https://api.test/ping' }),
        makeContext({ isDryRun: true }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.data.statusCode).toBe(200);
      expect(result.data).not.toHaveProperty('mocked');
    });

    it('should NEVER call fetch for a mutating method on dry-run, even without mockOnDryRun (safe-by-default)', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, { ok: true }));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action.execute(
        makeInput({ method: 'POST', url: 'https://api.test/charge', body: { amount: 100 } }),
        makeContext({ isDryRun: true }),
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.data).toMatchObject({ mocked: true, dryRun: true, skipped: true });
    });

    it('should call fetch normally when mockOnDryRun is set but isDryRun is false (regular run)', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, { ok: true }));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action.execute(
        makeInput({ method: 'GET', url: 'https://api.test/ping', mockOnDryRun: true }),
        makeContext({ isDryRun: false }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.data.statusCode).toBe(200);
      expect(result.data).not.toHaveProperty('mocked');
    });
  });

  describe('SSRF guard', () => {
    it.each([
      ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
      ['loopback IPv4', 'http://127.0.0.1/admin'],
      ['private 10/8', 'http://10.0.0.5/'],
      ['private 192.168/16', 'http://192.168.1.1/'],
      ['private 172.16/12', 'http://172.16.0.1/'],
      ['IPv6 loopback', 'http://[::1]/'],
      ['localhost', 'http://localhost:8000/'],
    ])('blocks %s and never calls fetch', async (_label, url) => {
      const fetchMock = mockFetch(async () => jsonResponse(200, { ok: true }));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await expect(
        action.execute(makeInput({ method: 'GET', url }), makeContext()),
      ).rejects.toThrow(/private or internal|localhost/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('blocks non-http(s) schemes', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await expect(
        action.execute(makeInput({ method: 'GET', url: 'file:///etc/passwd' }), makeContext()),
      ).rejects.toThrow(/scheme/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('blocks a hostname that resolves to a private address (DNS-based SSRF)', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, { ok: true }));
      const privateLookup: LookupFn = async () => [{ address: '10.1.2.3', family: 4 }];
      const action = new HttpRequestAction(fetchMock, privateLookup);

      await expect(
        action.execute(
          makeInput({ method: 'GET', url: 'https://evil.example.com/' }),
          makeContext(),
        ),
      ).rejects.toThrow(/private or internal/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows a public address through to fetch', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, { ok: true }));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action.execute(
        makeInput({ method: 'GET', url: 'https://api.test/items' }),
        makeContext(),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.data.statusCode).toBe(200);
    });
  });

  describe('connection-based auth', () => {
    const connInput = (params: Record<string, unknown>, connectionId: string): NodeInput => ({
      data: {},
      params,
      connectionId,
    });

    const stubGetConnection = (
      config: Record<string, unknown>,
    ): ExecutionContext['getConnection'] =>
      (async () => ({
        id: 'conn-1',
        type: 'CUSTOM',
        provider: 'http',
        config,
      })) as unknown as ExecutionContext['getConnection'];

    const ctxWithConnection = (config: Record<string, unknown>): ExecutionContext =>
      makeContext({ getConnection: stubGetConnection(config) });

    it('injects a Bearer Authorization header from a bearer connection', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await action.execute(
        connInput({ method: 'GET', url: 'https://api.test/me' }, 'conn-1'),
        ctxWithConnection({ authType: 'bearer', token: 'jwt-abc' }),
      );

      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers.authorization).toBe('Bearer jwt-abc');
    });

    it('injects a custom header from an apiKey connection', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await action.execute(
        connInput({ method: 'GET', url: 'https://api.test/me' }, 'conn-1'),
        ctxWithConnection({ authType: 'apiKey', headerName: 'X-Api-Key', apiKey: 'key-123' }),
      );

      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('key-123');
    });

    it('injects a Basic Authorization header from a basic connection', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await action.execute(
        connInput({ method: 'GET', url: 'https://api.test/me' }, 'conn-1'),
        ctxWithConnection({ authType: 'basic', username: 'alice', password: 'pw' }),
      );

      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
      const expected = `Basic ${Buffer.from('alice:pw').toString('base64')}`;
      expect(headers.authorization).toBe(expected);
    });

    it('lets the connection auth header win over a manually-typed header of the same name', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await action.execute(
        connInput(
          { method: 'GET', url: 'https://api.test/me', headers: { authorization: 'Bearer stale' } },
          'conn-1',
        ),
        ctxWithConnection({ authType: 'bearer', token: 'fresh' }),
      );

      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers.authorization).toBe('Bearer fresh');
    });

    it('does not call getConnection when no connectionId is present', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);
      const getConnection = jest.fn(stubGetConnection({ authType: 'bearer', token: 'x' }));

      await action.execute(
        makeInput({ method: 'GET', url: 'https://api.test/me' }),
        makeContext({
          getConnection: getConnection as unknown as ExecutionContext['getConnection'],
        }),
      );

      expect(getConnection).not.toHaveBeenCalled();
    });

    it('throws when the referenced connection cannot be resolved (stale id)', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);
      const ctx = makeContext({
        getConnection: jest.fn(async () => {
          throw new Error('Connection conn-1 not found');
        }),
      });

      await expect(
        action.execute(connInput({ method: 'GET', url: 'https://api.test/me' }, 'conn-1'), ctx),
      ).rejects.toThrow(/not found/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('redacts the injected auth header value in the dry-run preview', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action.execute(
        connInput({ method: 'POST', url: 'https://api.test/orders', body: { a: 1 } }, 'conn-1'),
        makeContext({
          isDryRun: true,
          getConnection: stubGetConnection({ authType: 'bearer', token: 'super-secret-jwt' }),
        }),
      );

      expect(fetchMock).not.toHaveBeenCalled();
      const sent = (result.data as { wouldHaveSent: { headers: Record<string, string> } })
        .wouldHaveSent;
      expect(sent.headers.authorization).not.toContain('super-secret-jwt');
      expect(sent.headers.authorization).toMatch(/Bearer \*+/);
    });
  });

  describe('redirect handling (SSRF re-validation)', () => {
    const redirectResponse = (location: string, status = 302): Response =>
      new Response(null, { status, headers: { location } });

    it('blocks a 302 whose Location is a private/metadata IP and never returns the internal body', async () => {
      // First hop: public host returns a 302 -> cloud metadata. Second fetch
      // would expose the internal body if the redirect were auto-followed.
      const fetchMock = mockFetch(async (url) => {
        if (url === 'https://api.test/redirect') {
          return redirectResponse('http://169.254.169.254/latest/meta-data/');
        }
        // This must NEVER be reached — the SSRF guard must block before re-fetch.
        return jsonResponse(200, { secret: 'instance-credentials' });
      });
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action
        .execute(makeInput({ method: 'GET', url: 'https://api.test/redirect' }), makeContext())
        .catch((e: unknown) => e as Error);

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toMatch(/private or internal/i);
      // The internal metadata endpoint must never have been requested.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/redirect');
    });

    it('passes redirect: manual to fetch so undici does not auto-follow', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, { ok: true }));
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await action.execute(
        makeInput({ method: 'GET', url: 'https://api.test/items' }),
        makeContext(),
      );

      const init = fetchMock.mock.calls[0][1];
      expect(init?.redirect).toBe('manual');
    });

    it('follows a 302 to an allowed public URL and returns the final body (fetch called twice)', async () => {
      const fetchMock = mockFetch(async (url) => {
        if (url === 'https://api.test/start') {
          return redirectResponse('https://api.test/final');
        }
        return jsonResponse(200, { landed: true });
      });
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action.execute(
        makeInput({ method: 'GET', url: 'https://api.test/start' }),
        makeContext(),
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe('https://api.test/final');
      expect(result.data.statusCode).toBe(200);
      expect(result.data.body).toEqual({ landed: true });
    });

    it('resolves a relative Location against the current URL and re-validates it', async () => {
      const fetchMock = mockFetch(async (url) => {
        if (url === 'https://api.test/a/b') {
          return redirectResponse('/c/d');
        }
        return jsonResponse(200, { at: url });
      });
      const action = new HttpRequestAction(fetchMock, stubLookup);

      const result = await action.execute(
        makeInput({ method: 'GET', url: 'https://api.test/a/b' }),
        makeContext(),
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe('https://api.test/c/d');
      expect(result.data.body).toEqual({ at: 'https://api.test/c/d' });
    });

    it('rejects when the redirect hop cap is exceeded', async () => {
      // Always redirect to a fresh public URL — guard passes each hop but the
      // bounded loop must give up after the cap.
      let n = 0;
      const fetchMock = mockFetch(async () => {
        n += 1;
        return redirectResponse(`https://api.test/hop-${n}`);
      });
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await expect(
        action.execute(makeInput({ method: 'GET', url: 'https://api.test/loop' }), makeContext()),
      ).rejects.toThrow(/redirect/i);
    });

    it('drops the Authorization header when the redirect crosses origin', async () => {
      const publicLookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];
      const fetchMock = mockFetch(async (url) => {
        if (url === 'https://api.test/login') {
          return redirectResponse('https://other.test/landing');
        }
        return jsonResponse(200, { ok: true });
      });
      const action = new HttpRequestAction(fetchMock, publicLookup);

      await action.execute(
        connInputAuth({ method: 'GET', url: 'https://api.test/login' }, 'conn-1'),
        makeContext({
          getConnection: (async () => ({
            id: 'conn-1',
            type: 'CUSTOM',
            provider: 'http',
            config: { authType: 'bearer', token: 'super-secret' },
          })) as unknown as ExecutionContext['getConnection'],
        }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
      const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
      expect(firstHeaders.authorization).toBe('Bearer super-secret');
      expect(secondHeaders.authorization).toBeUndefined();
    });

    it('keeps the Authorization header on a same-origin redirect', async () => {
      const fetchMock = mockFetch(async (url) => {
        if (url === 'https://api.test/login') {
          return redirectResponse('https://api.test/landing');
        }
        return jsonResponse(200, { ok: true });
      });
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await action.execute(
        connInputAuth({ method: 'GET', url: 'https://api.test/login' }, 'conn-1'),
        makeContext({
          getConnection: (async () => ({
            id: 'conn-1',
            type: 'CUSTOM',
            provider: 'http',
            config: { authType: 'bearer', token: 'super-secret' },
          })) as unknown as ExecutionContext['getConnection'],
        }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
      expect(secondHeaders.authorization).toBe('Bearer super-secret');
    });
  });

  describe('DNS-rebinding socket pin (W5.6)', () => {
    const redirectResponse = (location: string, status = 302): Response =>
      new Response(null, { status, headers: { location } });

    it('pins the connection to the pre-validated address(es) and never re-resolves the hostname', async () => {
      // The guard's lookup returns a PUBLIC address at validate time. A pinned
      // dispatcher must carry ONLY that address; a rebinding lookup that would
      // hand back a private IP at connect time is never consulted.
      const validatedLookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];
      const factory = jest.fn<ReturnType<DispatcherFactory>, Parameters<DispatcherFactory>>(
        () => ({ dispatcher: 'pinned' }) as unknown as ReturnType<DispatcherFactory>,
      );
      const fetchMock = mockFetch(async () => jsonResponse(200, { ok: true }));
      const action = new HttpRequestAction(fetchMock, validatedLookup, factory);

      await action.execute(
        makeInput({ method: 'GET', url: 'https://api.test/items' }),
        makeContext(),
      );

      // The dispatcher was built from exactly the validated address set.
      expect(factory).toHaveBeenCalledTimes(1);
      expect(factory.mock.calls[0][0].addresses).toEqual(['93.184.216.34']);
      // SNI/Host preserved as the original hostname.
      expect(factory.mock.calls[0][0].servername).toBe('api.test');
      // The dispatcher built from validated addresses is handed to fetch.
      const init = fetchMock.mock.calls[0][1] as RequestInit & { dispatcher?: unknown };
      expect(init.dispatcher).toEqual({ dispatcher: 'pinned' });
    });

    it('buildPinnedLookup resolves to ONLY the validated address regardless of the hostname queried (all:true)', () => {
      const lookup = buildPinnedLookup(['93.184.216.34']);
      const cb = jest.fn();
      // Even if the attacker rebinds rebind.evil to a private IP, this lookup
      // ignores the hostname and the real resolver entirely.
      lookup('rebind.evil', { all: true } as never, cb as never);
      expect(cb).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
    });

    it('buildPinnedLookup returns the first address with the correct family for a single-address callback', () => {
      const lookup = buildPinnedLookup(['2606:2800:220:1::1']);
      const cb = jest.fn();
      lookup('rebind.evil', {} as never, cb as never);
      expect(cb).toHaveBeenCalledWith(null, '2606:2800:220:1::1', 6);
    });

    it('does NOT build a pinned dispatcher for a literal-IP host (no DNS to rebind)', async () => {
      const factory = jest.fn<ReturnType<DispatcherFactory>, Parameters<DispatcherFactory>>(
        () => ({ dispatcher: 'pinned' }) as unknown as ReturnType<DispatcherFactory>,
      );
      const fetchMock = mockFetch(async () => jsonResponse(200, { ok: true }));
      const action = new HttpRequestAction(fetchMock, stubLookup, factory);

      await action.execute(
        makeInput({ method: 'GET', url: 'https://93.184.216.34/health' }),
        makeContext(),
      );

      expect(factory).not.toHaveBeenCalled();
      const init = fetchMock.mock.calls[0][1] as RequestInit & { dispatcher?: unknown };
      expect(init.dispatcher).toBeUndefined();
    });

    it('rebuilds the pinned dispatcher on every redirect hop from that hop’s validated addresses', async () => {
      const validatedLookup: LookupFn = async (host: string) =>
        host === 'start.test'
          ? [{ address: '93.184.216.34', family: 4 }]
          : [{ address: '203.0.113.7', family: 4 }];
      const factory = jest.fn<ReturnType<DispatcherFactory>, Parameters<DispatcherFactory>>(
        (opts) => ({ pinnedTo: opts.addresses }) as unknown as ReturnType<DispatcherFactory>,
      );
      const fetchMock = mockFetch(async (url) => {
        if (url === 'https://start.test/go') {
          return redirectResponse('https://final.test/landing');
        }
        return jsonResponse(200, { landed: true });
      });
      const action = new HttpRequestAction(fetchMock, validatedLookup, factory);

      const result = await action.execute(
        makeInput({ method: 'GET', url: 'https://start.test/go' }),
        makeContext(),
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstInit = fetchMock.mock.calls[0][1] as RequestInit & { dispatcher?: unknown };
      const secondInit = fetchMock.mock.calls[1][1] as RequestInit & { dispatcher?: unknown };
      expect(firstInit.dispatcher).toEqual({ pinnedTo: ['93.184.216.34'] });
      expect(secondInit.dispatcher).toEqual({ pinnedTo: ['203.0.113.7'] });
      expect(result.data.body).toEqual({ landed: true });
    });
  });

  describe('response size cap', () => {
    it('rejects a response whose Content-Length exceeds the cap', async () => {
      const big = String(11 * 1024 * 1024);
      const fetchMock = mockFetch(
        async () => new Response('x', { status: 200, headers: { 'content-length': big } }),
      );
      const action = new HttpRequestAction(fetchMock, stubLookup);

      await expect(
        action.execute(makeInput({ method: 'GET', url: 'https://api.test/huge' }), makeContext()),
      ).rejects.toThrow(/byte limit/i);
    });
  });
});
