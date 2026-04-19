import type { ExecutionContext, NodeInput } from '@tietide/sdk';
import { HttpRequestAction, type FetchLike } from './http-request';

const mockFetch = (impl: FetchLike) => jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(impl);

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

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext => ({
  executionId: 'exec-1',
  workflowId: 'wf-1',
  nodeId: 'node-1',
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  getSecret: jest.fn(async () => 'secret-value'),
  ...overrides,
});

const makeInput = (
  params: Record<string, unknown>,
  data: Record<string, unknown> = {},
): NodeInput => ({
  data,
  params,
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
      const action = new HttpRequestAction();
      expect(action.type).toBe('http-request');
    });

    it('should expose a human-readable name and description', () => {
      const action = new HttpRequestAction();
      expect(action.name).toBe('HTTP Request');
      expect(typeof action.description).toBe('string');
      expect(action.description.length).toBeGreaterThan(0);
    });

    it('should be categorized as an action', () => {
      const action = new HttpRequestAction();
      expect(action.category).toBe('action');
    });
  });

  describe('execute — GET request', () => {
    it('should return response body, statusCode, headers and duration for a 200 GET', async () => {
      const fetchMock = mockFetch(async () =>
        jsonResponse(200, { ok: true, count: 3 }, { 'x-custom': 'abc' }),
      );
      const action = new HttpRequestAction(fetchMock);

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
      const action = new HttpRequestAction(fetchMock);

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
      const action = new HttpRequestAction(fetchMock);

      await action.execute(makeInput({ url: 'https://api.test/' }), makeContext());

      expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
    });

    it('should parse plain-text responses as string bodies', async () => {
      const fetchMock = mockFetch(async () => textResponse(200, 'hello'));
      const action = new HttpRequestAction(fetchMock);

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
      const action = new HttpRequestAction(fetchMock);

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
      const action = new HttpRequestAction(fetchMock);

      await action.execute(
        makeInput({ method: 'POST', url: 'https://api.test/x', body: { a: 1 } }),
        makeContext(),
      );

      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['content-type']).toBe('application/json');
    });

    it('should send string body verbatim without stringifying it', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock);

      await action.execute(
        makeInput({ method: 'POST', url: 'https://api.test/x', body: 'raw-string-payload' }),
        makeContext(),
      );

      expect(fetchMock.mock.calls[0][1]?.body).toBe('raw-string-payload');
    });

    it('should merge custom headers with generated ones', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(200, {}));
      const action = new HttpRequestAction(fetchMock);

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
      const action = new HttpRequestAction(fetchMock);

      await expect(
        action.execute(
          makeInput({ method: 'GET', url: 'https://api.test/slow', timeout: 40 }),
          makeContext(),
        ),
      ).rejects.toThrow(/timed out/i);
    });

    it('should use a 30-second default timeout when none is provided', async () => {
      jest.useFakeTimers();
      try {
        const fetchMock = slowFetch();
        const action = new HttpRequestAction(fetchMock);

        const promise = action
          .execute(makeInput({ method: 'GET', url: 'https://api.test/slow' }), makeContext())
          .catch((e: unknown) => e as Error);

        jest.advanceTimersByTime(29_999);
        let settled = false;
        void promise.then(() => (settled = true));
        await Promise.resolve();
        expect(settled).toBe(false);

        jest.advanceTimersByTime(2);
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
      const action = new HttpRequestAction(fetchMock);

      await expect(
        action.execute(
          makeInput({ method: 'GET', url: 'https://api.test/missing' }),
          makeContext(),
        ),
      ).rejects.toThrow(/status 404/);
    });

    it('should throw when the response status is >= 500', async () => {
      const fetchMock = mockFetch(async () => jsonResponse(503, { error: 'boom' }));
      const action = new HttpRequestAction(fetchMock);

      await expect(
        action.execute(makeInput({ method: 'GET', url: 'https://api.test/down' }), makeContext()),
      ).rejects.toThrow(/status 503/);
    });

    it('should wrap network errors in a descriptive Error', async () => {
      const fetchMock = mockFetch(async () => {
        throw new TypeError('fetch failed: ENOTFOUND');
      });
      const action = new HttpRequestAction(fetchMock);

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
      const action = new HttpRequestAction(mockFetch(async () => jsonResponse(200, {})));

      await expect(action.execute(makeInput({ method: 'GET' }), makeContext())).rejects.toThrow(
        /url/i,
      );
    });

    it('should throw when url is not a string', async () => {
      const action = new HttpRequestAction(mockFetch(async () => jsonResponse(200, {})));

      await expect(
        action.execute(makeInput({ method: 'GET', url: 123 }), makeContext()),
      ).rejects.toThrow(/url/i);
    });
  });
});
