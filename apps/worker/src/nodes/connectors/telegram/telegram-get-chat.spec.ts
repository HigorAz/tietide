import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TelegramBotTokenConfig } from '@tietide/shared';
import { TelegramGetChatAction } from './telegram-get-chat';
import { TelegramHttpError, type TelegramClientFactory } from './telegram-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<TelegramClientFactory, 'call' | 'callMultipart' | 'baseUrl' | 'endpoint'>> => ({
  call,
  callMultipart: jest.fn(),
  baseUrl: jest.fn(),
  endpoint: jest.fn(),
});

function makeConnection(): DecryptedConnection<TelegramBotTokenConfig> {
  return {
    id: VALID_CONNECTION_ID,
    type: 'API_KEY',
    provider: 'telegram',
    config: { botToken: '123:ABC' },
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
  params: { connectionId: VALID_CONNECTION_ID, chatId: '@mychannel', ...overrides },
});

describe('TelegramGetChatAction', () => {
  let call: jest.Mock;
  let action: TelegramGetChatAction;

  beforeEach(() => {
    call = jest.fn();
    action = new TelegramGetChatAction(makeClient(call) as unknown as TelegramClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('telegram-get-chat');
    expect(action.requiredConnectionType).toBe('telegram');
  });

  it('calls getChat and maps the chat metadata', async () => {
    call.mockResolvedValue({
      status: 200,
      data: {
        ok: true,
        result: { id: -100123, type: 'channel', title: 'News', username: 'mychannel' },
      },
    });

    const result = await action.execute(makeInput(), makeContext());

    const [, method, payload] = call.mock.calls[0];
    expect(method).toBe('getChat');
    expect(payload).toEqual({ chat_id: '@mychannel' });
    expect(result.data).toEqual({
      id: -100123,
      type: 'channel',
      title: 'News',
      username: 'mychannel',
      description: null,
    });
  });

  it('surfaces TelegramHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new TelegramHttpError(401, { description: 'Unauthorized' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TelegramHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects a malformed chatId before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ chatId: 'not a chat' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});
