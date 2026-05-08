import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TelegramBotTokenConfig } from '@tietide/shared';
import { TelegramSendMessageAction } from './telegram-send-message';
import {
  TelegramHttpError,
  type TelegramClientFactory,
  type TelegramResponse,
} from './telegram-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '55555555-5555-4555-8555-555555555555';

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
    getConnection: jest.fn(),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return ctx as unknown as ExecutionContext & { markConnectionForRefresh: jest.Mock };
};

const makeConnection = (): DecryptedConnection<TelegramBotTokenConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'telegram',
  config: { botToken: '123456789:ABCDEF-secret_value' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    chatId: '123456789',
    text: 'hello telegram',
    ...overrides,
  },
});

describe('TelegramSendMessageAction', () => {
  it('calls sendMessage with chat_id and text', async () => {
    const call = jest.fn().mockResolvedValue({
      status: 200,
      data: {
        ok: true,
        result: { message_id: 42, chat: { id: 123456789 }, date: 1717000000 },
      },
    } as TelegramResponse);
    const action = new TelegramSendMessageAction({
      call,
      baseUrl: jest.fn(),
      endpoint: jest.fn(),
    } as unknown as TelegramClientFactory);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput(), ctx);

    const [, method, payload] = call.mock.calls[0];
    expect(method).toBe('sendMessage');
    expect(payload).toEqual({ chat_id: '123456789', text: 'hello telegram' });
    expect(result.data.ok).toBe(true);
    expect(result.data.messageId).toBe(42);
  });

  it('passes parse_mode and disable_notification when set', async () => {
    const call = jest.fn().mockResolvedValue({
      status: 200,
      data: { ok: true, result: { message_id: 1 } },
    } as TelegramResponse);
    const action = new TelegramSendMessageAction({
      call,
      baseUrl: jest.fn(),
      endpoint: jest.fn(),
    } as unknown as TelegramClientFactory);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await action.execute(makeInput({ parseMode: 'MarkdownV2', disableNotification: true }), ctx);
    const [, , payload] = call.mock.calls[0];
    expect(payload).toMatchObject({
      parse_mode: 'MarkdownV2',
      disable_notification: true,
    });
  });

  it('rejects malformed chatId', async () => {
    const call = jest.fn();
    const action = new TelegramSendMessageAction({
      call,
      baseUrl: jest.fn(),
      endpoint: jest.fn(),
    } as unknown as TelegramClientFactory);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ chatId: 'invalid chat' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  // Telegram uses a static bot-token credential — there is no refresh flow, so
  // a 401 surfaces verbatim and the user must rotate the token via BotFather.
  it('surfaces TelegramHttpError(401) verbatim when bot token is rejected', async () => {
    const call = jest
      .fn()
      .mockRejectedValue(new TelegramHttpError(401, { description: 'Unauthorized' }));
    const action = new TelegramSendMessageAction({
      call,
      baseUrl: jest.fn(),
      endpoint: jest.fn(),
    } as unknown as TelegramClientFactory);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TelegramHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('returns mocked output on dry-run', async () => {
    const call = jest.fn();
    const action = new TelegramSendMessageAction({
      call,
      baseUrl: jest.fn(),
      endpoint: jest.fn(),
    } as unknown as TelegramClientFactory);
    const ctx = makeContext({
      isDryRun: true,
      getConnection: jest.fn().mockResolvedValue(makeConnection()),
    });
    const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
    expect(call).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
