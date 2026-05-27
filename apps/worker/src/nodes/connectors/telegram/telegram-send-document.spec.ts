import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TelegramBotTokenConfig } from '@tietide/shared';
import { TelegramSendDocumentAction } from './telegram-send-document';
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
    source: 'fileId',
    fileId: 'BQACAgID-abc',
    ...overrides,
  },
});

describe('TelegramSendDocumentAction', () => {
  let call: jest.Mock;
  let callMultipart: jest.Mock;
  let action: TelegramSendDocumentAction;

  beforeEach(() => {
    call = jest.fn();
    callMultipart = jest.fn();
    action = new TelegramSendDocumentAction(
      makeClient(call, callMultipart) as unknown as TelegramClientFactory,
    );
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('telegram-send-document');
    expect(action.requiredConnectionType).toBe('telegram');
  });

  it('sends a file_id document via JSON sendDocument', async () => {
    call.mockResolvedValue({ status: 200, data: { ok: true, result: { message_id: 4 } } });

    const result = await action.execute(makeInput(), makeContext());

    expect(callMultipart).not.toHaveBeenCalled();
    const [, method, payload] = call.mock.calls[0];
    expect(method).toBe('sendDocument');
    expect(payload).toEqual({ chat_id: '12345', document: 'BQACAgID-abc' });
    expect(result.data.messageId).toBe(4);
  });

  it('uploads a base64 document via multipart', async () => {
    callMultipart.mockResolvedValue({ status: 200, data: { ok: true, result: { message_id: 5 } } });

    await action.execute(
      makeInput({ source: 'upload', fileId: undefined, contentBase64: 'aGk=', filename: 'r.pdf' }),
      makeContext(),
    );

    const [, method, , file] = callMultipart.mock.calls[0];
    expect(method).toBe('sendDocument');
    expect(file.field).toBe('document');
    expect(file.filename).toBe('r.pdf');
  });

  it('surfaces TelegramHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new TelegramHttpError(401, { description: 'Unauthorized' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TelegramHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects an unknown source before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ source: 'ftp' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
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
