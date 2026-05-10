import { ConfigService } from '@nestjs/config';
import { HubspotOAuthProvider } from './hubspot.provider';

const ENV: Record<string, string> = {
  HUBSPOT_OAUTH_CLIENT_ID: 'hubspot-client',
  HUBSPOT_OAUTH_CLIENT_SECRET: 'hubspot-secret',
  HUBSPOT_OAUTH_REDIRECT_URI:
    'http://localhost:3030/v1/connections/oauth/callback?provider=hubspot',
};

function makeConfig(): ConfigService {
  return {
    getOrThrow: (key: string) => {
      const v = ENV[key];
      if (v === undefined) throw new Error(`Missing ${key}`);
      return v;
    },
    get: (key: string) => ENV[key],
  } as unknown as ConfigService;
}

describe('HubspotOAuthProvider', () => {
  let provider: HubspotOAuthProvider;

  beforeEach(() => {
    provider = new HubspotOAuthProvider(makeConfig());
    jest.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds the authorize URL with space-separated scopes', () => {
    const url = new URL(
      provider.buildAuthorizeUrl({
        state: 'st',
        scopes: ['oauth', 'crm.objects.contacts.write'],
        redirectUri: provider.redirectUri(),
      }),
    );
    expect(url.host).toBe('app.hubspot.com');
    expect(url.pathname).toBe('/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe('oauth crm.objects.contacts.write');
    expect(url.searchParams.get('client_id')).toBe('hubspot-client');
    expect(url.searchParams.get('state')).toBe('st');
  });

  it('exchanges the auth code for access + refresh tokens', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'CN_access',
          refresh_token: 'CN_refresh',
          expires_in: 1800,
          token_type: 'bearer',
          hub_id: 12345,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await provider.exchangeCode({
      code: 'auth-code',
      redirectUri: provider.redirectUri(),
    });

    expect(result.config).toEqual({
      accessToken: 'CN_access',
      refreshToken: 'CN_refresh',
      tokenType: 'bearer',
      hubId: '12345',
    });
    expect(result.refreshToken).toBe('CN_refresh');
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('throws when access_token is missing', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ refresh_token: 'r' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      provider.exchangeCode({ code: 'c', redirectUri: provider.redirectUri() }),
    ).rejects.toThrow(/access_token/);
  });

  it('throws when refresh_token is missing on initial exchange', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'a' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      provider.exchangeCode({ code: 'c', redirectUri: provider.redirectUri() }),
    ).rejects.toThrow(/refresh_token/);
  });

  it('reuses the previous refresh_token when refresh response omits one', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'CN_access2',
          expires_in: 1800,
          token_type: 'bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await provider.refresh({
      refreshToken: 'CN_refresh_old',
      currentConfig: { hubId: '12345' },
    });

    expect(result.config).toMatchObject({
      accessToken: 'CN_access2',
      refreshToken: 'CN_refresh_old',
      hubId: '12345',
    });
    expect(result.refreshToken).toBe('CN_refresh_old');
  });

  it('rejects unknown scopes via allowedScopes set', () => {
    expect(provider.allowedScopes.has('oauth')).toBe(true);
    expect(provider.allowedScopes.has('crm.objects.contacts.write')).toBe(true);
    expect(provider.allowedScopes.has('not-a-scope')).toBe(false);
  });
});
