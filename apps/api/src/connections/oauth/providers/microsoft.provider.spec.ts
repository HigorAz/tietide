import { ConfigService } from '@nestjs/config';
import { MicrosoftOAuthProvider } from './microsoft.provider';

const ENV: Record<string, string> = {
  MS_OAUTH_CLIENT_ID: 'ms-client',
  MS_OAUTH_CLIENT_SECRET: 'ms-secret',
  MS_OAUTH_REDIRECT_URI: 'http://localhost:3030/v1/connections/oauth/callback?provider=microsoft',
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

describe('MicrosoftOAuthProvider', () => {
  let provider: MicrosoftOAuthProvider;

  beforeEach(() => {
    provider = new MicrosoftOAuthProvider(makeConfig());
    jest.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('buildAuthorizeUrl', () => {
    it('uses the common tenant by default', () => {
      const url = new URL(
        provider.buildAuthorizeUrl({
          state: 's',
          scopes: ['openid', 'offline_access'],
          redirectUri: provider.redirectUri(),
        }),
      );
      expect(url.host).toBe('login.microsoftonline.com');
      expect(url.pathname).toBe('/common/oauth2/v2.0/authorize');
      expect(url.searchParams.get('client_id')).toBe('ms-client');
      expect(url.searchParams.get('scope')).toBe('openid offline_access');
      expect(url.searchParams.get('response_type')).toBe('code');
    });

    it('honours MS_OAUTH_TENANT override when provided', () => {
      const tenanted = new MicrosoftOAuthProvider(
        makeConfig({ MS_OAUTH_TENANT: 'contoso.onmicrosoft.com' }),
      );
      const url = new URL(
        tenanted.buildAuthorizeUrl({
          state: 's',
          scopes: ['openid'],
          redirectUri: tenanted.redirectUri(),
        }),
      );
      expect(url.pathname).toBe('/contoso.onmicrosoft.com/oauth2/v2.0/authorize');
    });
  });

  describe('exchangeCode', () => {
    it('parses success response into Microsoft config shape', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'a',
            refresh_token: 'r',
            scope: 'openid offline_access',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await provider.exchangeCode({
        code: 'c',
        redirectUri: provider.redirectUri(),
      });
      expect(result.config).toMatchObject({
        accessToken: 'a',
        refreshToken: 'r',
        tenantId: 'common',
      });
      expect(result.refreshToken).toBe('r');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws when refresh_token is missing on initial exchange', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: 'a', token_type: 'Bearer', expires_in: 3600 }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      await expect(
        provider.exchangeCode({ code: 'c', redirectUri: provider.redirectUri() }),
      ).rejects.toThrow(/offline_access/i);
    });

    it('throws on non-2xx', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await expect(
        provider.exchangeCode({ code: 'c', redirectUri: provider.redirectUri() }),
      ).rejects.toThrow();
    });
  });
});
