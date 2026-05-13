import { ConfigService } from '@nestjs/config';
import { NotionOAuthProvider } from './notion.provider';

const ENV: Record<string, string> = {
  NOTION_OAUTH_CLIENT_ID: 'notion-client',
  NOTION_OAUTH_CLIENT_SECRET: 'notion-secret',
  NOTION_OAUTH_REDIRECT_URI: 'http://localhost:3030/v1/connections/oauth/callback?provider=notion',
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

describe('NotionOAuthProvider', () => {
  let provider: NotionOAuthProvider;

  beforeEach(() => {
    provider = new NotionOAuthProvider(makeConfig());
    jest.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws ServiceUnavailableException naming NOTION_OAUTH_REDIRECT_URI when unset', () => {
    const missing = {
      get: (_key: string) => undefined,
      getOrThrow: (k: string) => {
        throw new Error(`Missing ${k}`);
      },
    } as unknown as ConfigService;
    const p = new NotionOAuthProvider(missing);
    expect(() => p.redirectUri()).toThrow(/NOTION_OAUTH_REDIRECT_URI/);
    expect(() => p.redirectUri()).toThrow(/not configured/i);
  });

  it('builds an authorize URL with owner=user', () => {
    const url = new URL(
      provider.buildAuthorizeUrl({
        state: 'st',
        scopes: [],
        redirectUri: provider.redirectUri(),
      }),
    );
    expect(url.host).toBe('api.notion.com');
    expect(url.pathname).toBe('/v1/oauth/authorize');
    expect(url.searchParams.get('owner')).toBe('user');
    expect(url.searchParams.get('client_id')).toBe('notion-client');
  });

  it('exchanges code with HTTP Basic auth and parses workspace info', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'secret-xyz',
          workspace_id: 'ws-1',
          workspace_name: 'Acme HQ',
          bot_id: 'bot-1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await provider.exchangeCode({
      code: 'c',
      redirectUri: provider.redirectUri(),
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    const expectedBasic = Buffer.from('notion-client:notion-secret').toString('base64');
    expect(headers.Authorization).toBe(`Basic ${expectedBasic}`);
    expect(headers['Content-Type']).toBe('application/json');

    expect(result.config).toEqual({
      accessToken: 'secret-xyz',
      workspaceId: 'ws-1',
      workspaceName: 'Acme HQ',
      botId: 'bot-1',
    });
    expect(result.expiresAt).toBeNull();
    expect(result.refreshToken).toBeNull();
  });

  it('throws when access_token or workspace_id is missing', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'a' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      provider.exchangeCode({ code: 'c', redirectUri: provider.redirectUri() }),
    ).rejects.toThrow();
  });
});
