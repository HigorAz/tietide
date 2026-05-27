import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { DiscordBotConfig } from '@tietide/shared';
import { DiscordBotSendMessageAction } from './discord-bot-send-message';
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
  params: {
    connectionId: VALID_CONNECTION_ID,
    channelId: '900900900',
    content: 'hello',
    ...overrides,
  },
});

describe('DiscordBotSendMessageAction', () => {
  let call: jest.Mock;
  let action: DiscordBotSendMessageAction;

  beforeEach(() => {
    call = jest.fn();
    action = new DiscordBotSendMessageAction(
      makeClient(call) as unknown as DiscordBotClientFactory,
    );
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('discord-bot-send-message');
    expect(action.requiredConnectionType).toBe('discord-bot');
  });

  it('POSTs to /channels/{id}/messages with the bot token and returns the message id', async () => {
    call.mockResolvedValue({ status: 200, data: { id: '555', channel_id: '900900900' } });

    const result = await action.execute(makeInput(), makeContext());

    const [token, method, path, payload] = call.mock.calls[0];
    expect(token).toBe('bot-token');
    expect(method).toBe('POST');
    expect(path).toBe('/channels/900900900/messages');
    expect(payload).toEqual({ content: 'hello' });
    expect(result.data).toEqual({ ok: true, messageId: '555', channelId: '900900900' });
  });

  it('surfaces DiscordBotHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new DiscordBotHttpError(401, { message: '401: Unauthorized' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(DiscordBotHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric channelId before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ channelId: 'abc' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('skips the API on dry-run with mockOnDryRun', async () => {
    const result = await action.execute(
      makeInput({ mockOnDryRun: true }),
      makeContext({ isDryRun: true }),
    );
    expect(call).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
