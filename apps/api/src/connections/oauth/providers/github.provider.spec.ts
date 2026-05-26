import { ConfigService } from '@nestjs/config';
import { GithubOAuthProvider } from './github.provider';

const ENV: Record<string, string> = {
  GITHUB_OAUTH_CLIENT_ID: 'github-client',
  GITHUB_OAUTH_CLIENT_SECRET: 'github-secret',
  GITHUB_OAUTH_REDIRECT_URI: 'http://localhost:3031/v1/connections/oauth/callback?provider=github',
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

describe('GithubOAuthProvider', () => {
  let provider: GithubOAuthProvider;

  beforeEach(() => {
    provider = new GithubOAuthProvider(makeConfig());
    jest.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws ServiceUnavailableException naming GITHUB_OAUTH_REDIRECT_URI when unset', () => {
    const missing = {
      get: (_key: string) => undefined,
      getOrThrow: (k: string) => {
        throw new Error(`Missing ${k}`);
      },
    } as unknown as ConfigService;
    const p = new GithubOAuthProvider(missing);
    expect(() => p.redirectUri()).toThrow(/GITHUB_OAUTH_REDIRECT_URI/);
    expect(() => p.redirectUri()).toThrow(/not configured/i);
  });

  it('builds the authorize URL with space-separated scopes', () => {
    const url = new URL(
      provider.buildAuthorizeUrl({
        state: 'st',
        scopes: ['repo', 'read:user'],
        redirectUri: provider.redirectUri(),
      }),
    );
    expect(url.host).toBe('github.com');
    expect(url.pathname).toBe('/login/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe('repo read:user');
    expect(url.searchParams.get('client_id')).toBe('github-client');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('redirect_uri')).toBe(ENV.GITHUB_OAUTH_REDIRECT_URI);
  });

  it('exchanges the auth code for a non-expiring access token (no refresh token)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'gho_access',
          token_type: 'bearer',
          scope: 'repo,read:user',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await provider.exchangeCode({
      code: 'auth-code',
      redirectUri: provider.redirectUri(),
    });

    expect(result.config).toEqual({
      accessToken: 'gho_access',
      scope: 'repo,read:user',
      tokenType: 'bearer',
    });
    expect(result.refreshToken).toBeNull();
    expect(result.expiresAt).toBeNull();
  });

  it('throws when access_token is missing', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ token_type: 'bearer' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      provider.exchangeCode({ code: 'c', redirectUri: provider.redirectUri() }),
    ).rejects.toThrow(/access_token/);
  });

  it('refresh() throws — OAuth App tokens are not refreshable', async () => {
    await expect(
      provider.refresh({ refreshToken: 'x', currentConfig: {} }),
    ).rejects.toThrow(/do not expire|not refreshable/i);
  });

  it('exposes the allowed scope set', () => {
    expect(provider.allowedScopes.has('repo')).toBe(true);
    expect(provider.allowedScopes.has('public_repo')).toBe(true);
    expect(provider.allowedScopes.has('read:user')).toBe(true);
    expect(provider.allowedScopes.has('delete_repo')).toBe(false);
  });
});
