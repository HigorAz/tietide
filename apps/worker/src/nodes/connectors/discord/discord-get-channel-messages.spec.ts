import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { DiscordBotConfig } from '@tietide/shared';
import { DiscordGetChannelMessagesAction } from './discord-get-channel-messages';
import { DiscordBotHttpError, type DiscordBotClientFactory } from './discord-bot-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<DiscordBotClientFactory, 'call' | 'baseUrl'>> => ({
  call,
  baseUrl: jest.fn(),
});

function makeConnection(): DecryptedConnection<DiscordBotConfig> {
  return {
    id: VALID_CONNECTION_ID,
    type: 'API_KEY',
    provider: 'discord-bot',
    config: { applicationId: '123', publicKey: 'abcdef', botToken: 'bot-token' },
    refreshToken: undefined,
  };
}

const makeContext = (
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext & { markConnectionForRefresh: jest.Mock } => {
  const ctx = {
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSecret: jest.fn(),
    getConnection: jest.fn().mockResolvedValue(makeConnection()),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return ctx as unknown as ExecutionContext & { markConnectionForRefresh: jest.Mock };
};

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, channelId: '900900900', ...overrides },
});

describe('DiscordGetChannelMessagesAction', () => {
  let call: jest.Mock;
  let action: DiscordGetChannelMessagesAction;

  beforeEach(() => {
    call = jest.fn();
    action = new DiscordGetChannelMessagesAction(
      makeClient(call) as unknown as DiscordBotClientFactory,
    );
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('discord-get-channel-messages');
    expect(action.requiredConnectionType).toBe('discord-bot');
  });

  it('GETs /channels/{id}/messages with limit and maps the array', async () => {
    call.mockResolvedValue({
      status: 200,
      data: [
        {
          id: 'm1',
          content: 'hi',
          timestamp: '2026-01-01T00:00:00Z',
          author: { id: 'u1', username: 'jo' },
        },
      ],
    });

    const result = await action.execute(makeInput({ limit: 5 }), makeContext());

    const [token, method, path] = call.mock.calls[0];
    expect(token).toBe('bot-token');
    expect(method).toBe('GET');
    expect(path).toBe('/channels/900900900/messages?limit=5');
    expect(result.data.count).toBe(1);
    expect((result.data.messages as unknown[])[0]).toEqual({
      id: 'm1',
      content: 'hi',
      authorId: 'u1',
      authorUsername: 'jo',
      timestamp: '2026-01-01T00:00:00Z',
    });
  });

  it('surfaces DiscordBotHttpError(403) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new DiscordBotHttpError(403, { message: 'Missing Access' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(DiscordBotHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects a limit above 100 before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ limit: 500 }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});
