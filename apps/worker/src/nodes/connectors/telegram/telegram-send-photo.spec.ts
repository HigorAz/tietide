import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TelegramBotTokenConfig } from '@tietide/shared';
import { TelegramSendPhotoAction } from './telegram-send-photo';
import { TelegramHttpError, type TelegramClientFactory } from './telegram-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (
  call: jest.Mock = jest.fn(),
  callMultipart: jest.Mock = jest.fn(),
): jest.Mocked<Pick<TelegramClientFactory, 'call' | 'callMultipart' | 'baseUrl' | 'endpoint'>> => ({
  call,
  callMultipart,
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
    source: 'url',
    url: 'https://example.com/cat.png',
    ...overrides,
  },
});

describe('TelegramSendPhotoAction', () => {
  let call: jest.Mock;
  let callMultipart: jest.Mock;
  let action: TelegramSendPhotoAction;

  beforeEach(() => {
    call = jest.fn();
    callMultipart = jest.fn();
    action = new TelegramSendPhotoAction(
      makeClient(call, callMultipart) as unknown as TelegramClientFactory,
    );
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('telegram-send-photo');
    expect(action.requiredConnectionType).toBe('telegram');
  });

  it('sends a URL photo via JSON sendPhoto', async () => {
    call.mockResolvedValue({
      status: 200,
      data: { ok: true, result: { message_id: 9, chat: { id: 12345 } } },
    });

    const result = await action.execute(makeInput({ caption: 'hi' }), makeContext());

    expect(callMultipart).not.toHaveBeenCalled();
    const [, method, payload] = call.mock.calls[0];
    expect(method).toBe('sendPhoto');
    expect(payload).toEqual({
      chat_id: '12345',
      photo: 'https://example.com/cat.png',
      caption: 'hi',
    });
    expect(result.data).toEqual({ ok: true, messageId: 9, chatId: 12345 });
  });

  it('uploads a base64 photo via multipart', async () => {
    callMultipart.mockResolvedValue({
      status: 200,
      data: { ok: true, result: { message_id: 10 } },
    });

    const result = await action.execute(
      makeInput({
        source: 'upload',
        url: undefined,
        contentBase64: 'aGVsbG8=',
        filename: 'cat.png',
      }),
      makeContext(),
    );

    expect(call).not.toHaveBeenCalled();
    const [, method, fields, file] = callMultipart.mock.calls[0];
    expect(method).toBe('sendPhoto');
    expect(fields).toEqual({ chat_id: '12345' });
    expect(file.field).toBe('photo');
    expect(file.filename).toBe('cat.png');
    expect(Buffer.isBuffer(file.content)).toBe(true);
    expect(result.data.messageId).toBe(10);
  });

  it('surfaces TelegramHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new TelegramHttpError(401, { description: 'Unauthorized' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TelegramHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects an upload missing contentBase64 before any call', async () => {
    const ctx = makeContext();
    await expect(
      action.execute(makeInput({ source: 'upload', url: undefined, filename: 'x.png' }), ctx),
    ).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
    expect(callMultipart).not.toHaveBeenCalled();
  });

  it('skips the API on dry-run with mockOnDryRun', async () => {
    const result = await action.execute(
      makeInput({ mockOnDryRun: true }),
      makeContext({ isDryRun: true }),
    );
    expect(call).not.toHaveBeenCalled();
    expect(callMultipart).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
