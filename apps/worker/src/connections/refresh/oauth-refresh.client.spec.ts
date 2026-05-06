import type { ConfigService } from '@nestjs/config';
import { OAuthRefreshClient } from './oauth-refresh.client';

const ENV: Record<string, string> = {
  GOOGLE_OAUTH_CLIENT_ID: 'gid',
  GOOGLE_OAUTH_CLIENT_SECRET: 'gsecret',
  MS_OAUTH_CLIENT_ID: 'mid',
  MS_OAUTH_CLIENT_SECRET: 'msecret',
};

function makeConfig(overrides: Record<string, string | undefined> = {}): ConfigService {
  const merged: Record<string, string | undefined> = { ...ENV, ...overrides };
  return {
    getOrThrow: (k: string) => {
      const v = merged[k];
      if (v === undefined) throw new Error(`Missing ${k}`);
      return v;
    },
    get: (k: string) => merged[k],
  } as unknown as ConfigService;
}

describe('OAuthRefreshClient', () => {
  let client: OAuthRefreshClient;

  beforeEach(() => {
    client = new OAuthRefreshClient(makeConfig());
    jest.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('supports google and microsoft, not slack/notion', () => {
    expect(client.supports('google')).toBe(true);
    expect(client.supports('microsoft')).toBe(true);
    expect(client.supports('slack')).toBe(false);
    expect(client.supports('notion')).toBe(false);
  });

  it('refreshes a Google token and parses the new tokens + expiresAt', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
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

    const result = await client.refresh('google', 'rt-1', {
      accessToken: 'old',
      refreshToken: 'rt-1',
      scope: 'openid email',
      tokenType: 'Bearer',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = String((init as RequestInit).body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=rt-1');

    expect(result.config).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'rt-1',
      tokenType: 'Bearer',
    });
    expect(result.refreshToken).toBe('rt-1');
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('uses the rotated refresh token when google issues one', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'a',
          refresh_token: 'rotated-rt',
          expires_in: 600,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await client.refresh('google', 'rt-old', {
      accessToken: 'old',
      refreshToken: 'rt-old',
      scope: 'openid',
      tokenType: 'Bearer',
    });

    expect(result.refreshToken).toBe('rotated-rt');
    expect(result.config.refreshToken).toBe('rotated-rt');
  });

  it('substitutes {tenant} in the Microsoft token URL using currentConfig.tenantId', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
          scope: 'openid',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await client.refresh('microsoft', 'rt', {
      accessToken: 'a',
      refreshToken: 'rt',
      scope: 'openid',
      tokenType: 'Bearer',
      tenantId: 'contoso',
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://login.microsoftonline.com/contoso/oauth2/v2.0/token',
    );
  });

  it('throws on a non-2xx response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      client.refresh('google', 'rt', {
        accessToken: 'a',
        refreshToken: 'rt',
        scope: '',
        tokenType: 'Bearer',
      }),
    ).rejects.toThrow(/invalid_grant|OAuth refresh failed/i);
  });

  it('throws for unsupported providers', async () => {
    await expect(client.refresh('slack', 'r', {})).rejects.toThrow(/not supported/i);
  });
});
