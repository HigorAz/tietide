import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TelegramBotTokenConfig } from '@tietide/shared';
import { TelegramEditMessageAction } from './telegram-edit-message';
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
  params: {
    connectionId: VALID_CONNECTION_ID,
    chatId: '12345',
    messageId: 42,
    text: 'edited',
    ...overrides,
  },
});

describe('TelegramEditMessageAction', () => {
  let call: jest.Mock;
  let action: TelegramEditMessageAction;

  beforeEach(() => {
    call = jest.fn();
    action = new TelegramEditMessageAction(makeClient(call) as unknown as TelegramClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('telegram-edit-message');
    expect(action.requiredConnectionType).toBe('telegram');
  });

  it('calls editMessageText with chat_id, message_id and text', async () => {
    call.mockResolvedValue({ status: 200, data: { ok: true, result: { message_id: 42 } } });

    const result = await action.execute(makeInput({ parseMode: 'HTML' }), makeContext());

    const [, method, payload] = call.mock.calls[0];
    expect(method).toBe('editMessageText');
    expect(payload).toEqual({
      chat_id: '12345',
      message_id: 42,
      text: 'edited',
      parse_mode: 'HTML',
    });
    expect(result.data).toEqual({ ok: true, messageId: 42 });
  });

  it('surfaces TelegramHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new TelegramHttpError(401, { description: 'Unauthorized' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TelegramHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects a non-integer messageId before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ messageId: 1.5 }), ctx)).rejects.toThrow();
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
