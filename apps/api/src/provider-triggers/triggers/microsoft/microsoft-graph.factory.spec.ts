import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftGraphFactory, MicrosoftGraphHttpError } from './microsoft-graph.factory';

const makeConnection = (
  overrides: Partial<MicrosoftOAuth2Config> = {},
): DecryptedConnection<MicrosoftOAuth2Config> =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    type: 'OAUTH2',
    provider: 'microsoft',
    config: {
      accessToken: 'access-token-1',
      refreshToken: 'refresh-token-1',
      scope: 'Mail.Read Files.Read offline_access',
      tokenType: 'Bearer',
      ...overrides,
    },
    refreshToken: 'refresh-token-1',
  }) as DecryptedConnection<MicrosoftOAuth2Config>;

const makeConfig = (overrides: Record<string, string | undefined> = {}): ConfigService =>
  ({
    get: (key: string) => overrides[key],
  }) as unknown as ConfigService;

describe('MicrosoftGraphFactory', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('graphFetch', () => {
    it('attaches the Bearer access token from the connection and POSTs JSON by default', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'sub-123' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const factory = new MicrosoftGraphFactory(makeConfig());
      const result = await factory.graphFetch<{ id: string }>(
        makeConnection(),
        '/v1.0/subscriptions',
        {
          method: 'POST',
          body: JSON.stringify({ resource: '/me/messages' }),
        },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://graph.microsoft.com/v1.0/subscriptions');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer access-token-1');
      expect(headers['Content-Type']).toBe('application/json');
      expect(result).toEqual({ status: 201, data: { id: 'sub-123' } });
    });

    it('returns null data on 204 No Content (subscription DELETE)', async () => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 204 }),
        ) as unknown as typeof globalThis.fetch;

      const factory = new MicrosoftGraphFactory(makeConfig());
      const result = await factory.graphFetch(makeConnection(), '/v1.0/subscriptions/abc', {
        method: 'DELETE',
      });

      expect(result).toEqual({ status: 204, data: null });
    });

    it('throws MicrosoftGraphHttpError preserving status on non-2xx (401)', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'InvalidAuthenticationToken' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      ) as unknown as typeof globalThis.fetch;

      const factory = new MicrosoftGraphFactory(makeConfig());

      await expect(
        factory.graphFetch(makeConnection(), '/v1.0/me', { method: 'GET' }),
      ).rejects.toMatchObject({
        name: 'MicrosoftGraphHttpError',
        response: { status: 401 },
      });
    });

    it('throws MicrosoftGraphHttpError on 404 (DELETE on missing subscription)', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        }),
      ) as unknown as typeof globalThis.fetch;

      const factory = new MicrosoftGraphFactory(makeConfig());

      await expect(
        factory.graphFetch(makeConnection(), '/v1.0/subscriptions/abc', { method: 'DELETE' }),
      ).rejects.toBeInstanceOf(MicrosoftGraphHttpError);
    });

    it('honors MICROSOFT_GRAPH_URL override (test fixture)', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const factory = new MicrosoftGraphFactory(
        makeConfig({ MICROSOFT_GRAPH_URL: 'http://localhost:9999' }),
      );
      await factory.graphFetch(makeConnection(), '/v1.0/me');

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe('http://localhost:9999/v1.0/me');
    });

    it('passes through caller-supplied headers (e.g. Prefer)', async () => {
      const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const factory = new MicrosoftGraphFactory(makeConfig());
      await factory.graphFetch(makeConnection(), '/v1.0/subscriptions/abc', {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.Prefer).toBe('return=minimal');
      expect(headers.Authorization).toBe('Bearer access-token-1');
    });
  });
});
