import type { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';

jest.setTimeout(15000);

const makeConfig = (env: Record<string, string | undefined> = {}): ConfigService =>
  ({
    get: (key: string) => env[key],
  }) as unknown as ConfigService;

const makeConnection = (
  overrides: Partial<DecryptedConnection<MicrosoftOAuth2Config>> = {},
): DecryptedConnection<MicrosoftOAuth2Config> => ({
  id: 'conn-1',
  type: 'OAUTH2',
  provider: 'microsoft',
  config: {
    accessToken: 'at',
    refreshToken: 'rt',
    scope: 'Mail.Send',
    tokenType: 'Bearer',
  },
  refreshToken: 'rt',
  ...overrides,
});

describe('MicrosoftAuthService', () => {
  describe('buildAuthHeader', () => {
    it('returns a Bearer Authorization header from the decrypted connection', () => {
      const service = new MicrosoftAuthService(makeConfig());
      const headers = service.buildAuthHeader(makeConnection());
      expect(headers.Authorization).toBe('Bearer at');
    });
  });

  describe('graphBaseUrl', () => {
    it('defaults to the public Graph endpoint', () => {
      const service = new MicrosoftAuthService(makeConfig());
      expect(service.graphBaseUrl()).toBe('https://graph.microsoft.com');
    });

    it('honors MICROSOFT_GRAPH_URL env override', () => {
      const service = new MicrosoftAuthService(
        makeConfig({ MICROSOFT_GRAPH_URL: 'https://graph.test.example/' }),
      );
      expect(service.graphBaseUrl()).toBe('https://graph.test.example');
    });
  });

  describe('graphFetch', () => {
    let originalFetch: typeof globalThis.fetch | undefined;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      if (originalFetch) globalThis.fetch = originalFetch;
    });

    it('attaches the Bearer header and returns parsed JSON on 2xx', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const service = new MicrosoftAuthService(makeConfig());
      const result = await service.graphFetch(makeConnection(), '/v1.0/me');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://graph.microsoft.com/v1.0/me');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer at');
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ id: 'x' });
    });

    it('returns null data when response is 204 No Content', async () => {
      const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const service = new MicrosoftAuthService(makeConfig());
      const result = await service.graphFetch(makeConnection(), '/v1.0/me/sendMail', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(result.status).toBe(204);
      expect(result.data).toBeNull();
    });

    it('throws an error with response.status set on 401 (auth failure)', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'InvalidAuthenticationToken' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      );
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const service = new MicrosoftAuthService(makeConfig());
      await expect(service.graphFetch(makeConnection(), '/v1.0/me')).rejects.toMatchObject({
        response: { status: 401 },
      });
    });

    it('throws an error with response.status set on 403 (permission failure)', async () => {
      const fetchMock = jest.fn().mockResolvedValue(new Response('forbidden', { status: 403 }));
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const service = new MicrosoftAuthService(makeConfig());
      await expect(service.graphFetch(makeConnection(), '/v1.0/me')).rejects.toMatchObject({
        response: { status: 403 },
      });
    });

    it('throws an error with response.status set on 4xx user errors (e.g. 400)', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'bad request' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      );
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const service = new MicrosoftAuthService(makeConfig());
      await expect(service.graphFetch(makeConnection(), '/v1.0/me')).rejects.toMatchObject({
        response: { status: 400 },
      });
    });

    it('passes init.method and JSON content-type for POST', async () => {
      const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 202 }));
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const service = new MicrosoftAuthService(makeConfig());
      await service.graphFetch(makeConnection(), '/v1.0/me/sendMail', {
        method: 'POST',
        body: JSON.stringify({ message: { subject: 'hi' } }),
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    });

    it('supports raw binary uploads via Buffer body without forcing application/json', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'file-1' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const service = new MicrosoftAuthService(makeConfig());
      const buf = Buffer.from('hello', 'utf8');
      await service.graphFetch(makeConnection(), '/v1.0/me/drive/root:/test.txt:/content', {
        method: 'PUT',
        body: buf,
        contentType: 'text/plain',
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
      expect(init.body).toBe(buf);
    });
  });
});
