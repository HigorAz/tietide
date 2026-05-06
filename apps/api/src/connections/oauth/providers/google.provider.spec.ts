import { ConfigService } from '@nestjs/config';
import { GoogleOAuthProvider } from './google.provider';

const ENV: Record<string, string> = {
  GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3030/v1/connections/oauth/callback?provider=google',
};

function makeConfig(overrides: Partial<Record<string, string | undefined>> = {}): ConfigService {
  const merged: Record<string, string | undefined> = { ...ENV, ...overrides };
  return {
    getOrThrow: (key: string) => {
      const v = merged[key];
      if (v === undefined) throw new Error(`Missing ${key}`);
      return v;
    },
    get: (key: string) => merged[key],
  } as unknown as ConfigService;
}

describe('GoogleOAuthProvider', () => {
  let provider: GoogleOAuthProvider;

  beforeEach(() => {
    provider = new GoogleOAuthProvider(makeConfig());
    jest.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('buildAuthorizeUrl', () => {
    it('produces a Google authorize URL with required parameters', () => {
      const url = provider.buildAuthorizeUrl({
        state: 'state-123',
        scopes: ['openid', 'email'],
        redirectUri: provider.redirectUri(),
      });

      const u = new URL(url);
      expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(u.searchParams.get('client_id')).toBe('test-client-id');
      expect(u.searchParams.get('redirect_uri')).toBe(provider.redirectUri());
      expect(u.searchParams.get('response_type')).toBe('code');
      expect(u.searchParams.get('scope')).toBe('openid email');
      expect(u.searchParams.get('state')).toBe('state-123');
      expect(u.searchParams.get('access_type')).toBe('offline');
      expect(u.searchParams.get('prompt')).toBe('consent');
      expect(u.searchParams.get('include_granted_scopes')).toBe('true');
    });
  });

  describe('exchangeCode', () => {
    it('posts form-encoded body and parses success response', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'access-abc',
            refresh_token: 'refresh-xyz',
            expires_in: 3600,
            scope: 'openid email',
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const before = Date.now();
      const result = await provider.exchangeCode({
        code: 'auth-code-1',
        redirectUri: provider.redirectUri(),
      });
      const after = Date.now();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://oauth2.googleapis.com/token');
      const reqInit = init as RequestInit;
      expect(reqInit.method).toBe('POST');
      const body = String(reqInit.body);
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code=auth-code-1');
      expect(body).toContain('client_id=test-client-id');
      expect(body).toContain('client_secret=test-client-secret');

      expect(result.config).toEqual({
        accessToken: 'access-abc',
        refreshToken: 'refresh-xyz',
        scope: 'openid email',
        tokenType: 'Bearer',
      });
      expect(result.refreshToken).toBe('refresh-xyz');
      expect(result.expiresAt).toBeInstanceOf(Date);
      const expiresAt = result.expiresAt!.getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000 - 100);
      expect(expiresAt).toBeLessThanOrEqual(after + 3600 * 1000 + 100);
    });

    it('throws on a non-2xx response', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(
        provider.exchangeCode({ code: 'bad', redirectUri: provider.redirectUri() }),
      ).rejects.toThrow(/invalid_grant|Google token exchange failed/i);
    });

    it('throws when the response is missing access_token', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ token_type: 'Bearer' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(
        provider.exchangeCode({ code: 'x', redirectUri: provider.redirectUri() }),
      ).rejects.toThrow();
    });
  });

  describe('refresh', () => {
    it('posts grant_type=refresh_token and preserves the original refresh token if response omits one', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'new-access',
            expires_in: 1800,
            scope: 'openid email',
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await provider.refresh({
        refreshToken: 'rt-original',
        currentConfig: {
          accessToken: 'old',
          refreshToken: 'rt-original',
          scope: 'openid email',
          tokenType: 'Bearer',
        },
      });

      const body = String((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body).toContain('grant_type=refresh_token');
      expect(body).toContain('refresh_token=rt-original');

      expect(result.refreshToken).toBe('rt-original');
      expect(result.config).toMatchObject({
        accessToken: 'new-access',
        refreshToken: 'rt-original',
      });
    });

    it('uses the rotated refresh token when the provider issues one', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'new-access',
            refresh_token: 'rt-rotated',
            expires_in: 1800,
            scope: 'openid email',
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await provider.refresh({
        refreshToken: 'rt-original',
        currentConfig: {
          accessToken: 'old',
          refreshToken: 'rt-original',
          scope: 'openid email',
          tokenType: 'Bearer',
        },
      });

      expect(result.refreshToken).toBe('rt-rotated');
      expect(result.config).toMatchObject({ refreshToken: 'rt-rotated' });
    });
  });
});
