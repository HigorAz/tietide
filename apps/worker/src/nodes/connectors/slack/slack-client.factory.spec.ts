import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { SlackOAuth2Config } from '@tietide/shared';
import { SlackClientFactory } from './slack-client.factory';

jest.setTimeout(15000);

function makeConfig(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

function makeConnection(
  overrides: Partial<SlackOAuth2Config> = {},
): DecryptedConnection<SlackOAuth2Config> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'OAUTH2',
    provider: 'slack',
    config: {
      accessToken: 'xoxb-bot',
      teamId: 'T1',
      botUserId: 'U1',
      scope: 'chat:write',
      ...overrides,
    },
    refreshToken: undefined,
  };
}

function okResponse(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SlackClientFactory', () => {
  let factory: SlackClientFactory;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    factory = new SlackClientFactory(makeConfig());
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const authHeaderOf = (): string => {
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    return (init.headers as Record<string, string>).Authorization;
  };

  it('uses the bot token by default', async () => {
    await factory.call(makeConnection({ userAccessToken: 'xoxp-user' }), '/auth.test', {
      method: 'GET',
    });
    expect(authHeaderOf()).toBe('Bearer xoxb-bot');
  });

  it('overrides Authorization with the user token when useUserToken is set', async () => {
    await factory.call(makeConnection({ userAccessToken: 'xoxp-user' }), '/search.messages', {
      method: 'GET',
      useUserToken: true,
    });
    expect(authHeaderOf()).toBe('Bearer xoxp-user');
  });

  it('keeps the bot token when useUserToken is set but no user token exists', async () => {
    await factory.call(makeConnection(), '/search.messages', {
      method: 'GET',
      useUserToken: true,
    });
    expect(authHeaderOf()).toBe('Bearer xoxb-bot');
  });
});
