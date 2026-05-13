import { ConfigService } from '@nestjs/config';
import { SlackOAuthProvider } from './slack.provider';

const ENV: Record<string, string> = {
  SLACK_OAUTH_CLIENT_ID: 'slack-client',
  SLACK_OAUTH_CLIENT_SECRET: 'slack-secret',
  SLACK_OAUTH_REDIRECT_URI: 'http://localhost:3030/v1/connections/oauth/callback?provider=slack',
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

describe('SlackOAuthProvider', () => {
  let provider: SlackOAuthProvider;

  beforeEach(() => {
    provider = new SlackOAuthProvider(makeConfig());
    jest.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws ServiceUnavailableException naming SLACK_OAUTH_REDIRECT_URI when unset', () => {
    const missing = {
      get: (_key: string) => undefined,
      getOrThrow: (k: string) => {
        throw new Error(`Missing ${k}`);
      },
    } as unknown as ConfigService;
    const p = new SlackOAuthProvider(missing);
    expect(() => p.redirectUri()).toThrow(/SLACK_OAUTH_REDIRECT_URI/);
    expect(() => p.redirectUri()).toThrow(/not configured/i);
  });

  it('builds the v2 authorize URL with comma-separated scopes', () => {
    const url = new URL(
      provider.buildAuthorizeUrl({
        state: 'st',
        scopes: ['chat:write', 'channels:read'],
        redirectUri: provider.redirectUri(),
      }),
    );
    expect(url.host).toBe('slack.com');
    expect(url.pathname).toBe('/oauth/v2/authorize');
    expect(url.searchParams.get('scope')).toBe('chat:write,channels:read');
  });

  it('parses team.id and bot_user_id from the nested response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          access_token: 'xoxb-1',
          scope: 'chat:write,channels:read',
          bot_user_id: 'U999',
          team: { id: 'T123' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await provider.exchangeCode({
      code: 'c',
      redirectUri: provider.redirectUri(),
    });

    expect(result.config).toEqual({
      accessToken: 'xoxb-1',
      teamId: 'T123',
      botUserId: 'U999',
      scope: 'chat:write,channels:read',
    });
    expect(result.expiresAt).toBeNull();
    expect(result.refreshToken).toBeNull();
  });

  it('throws on { ok: false } response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'invalid_code' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      provider.exchangeCode({ code: 'c', redirectUri: provider.redirectUri() }),
    ).rejects.toThrow(/invalid_code/);
  });

  it('refresh always throws (Slack tokens do not expire)', async () => {
    await expect(provider.refresh({ refreshToken: 'x', currentConfig: {} })).rejects.toThrow();
  });
});
