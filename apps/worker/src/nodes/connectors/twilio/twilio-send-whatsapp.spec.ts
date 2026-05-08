import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TwilioApiKeyConfig } from '@tietide/shared';
import { TwilioSendWhatsAppAction } from './twilio-send-whatsapp';
import type { TwilioClientFactory, TwilioResponse } from './twilio-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '44444444-4444-4444-8444-444444444444';
const TWILIO_ACCOUNT_SID = 'AC-fakefakefakefakefakefakefakefak';
const VALID_CONTENT_SID = 'HX-fakefakefakefakefakefakefakefak';

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

const makeConnection = (): DecryptedConnection<TwilioApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'twilio',
  config: { accountSid: TWILIO_ACCOUNT_SID, authToken: 'authtoken' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    from: 'whatsapp:+14155238886',
    to: 'whatsapp:+14155550101',
    contentSid: VALID_CONTENT_SID,
    contentVariables: { '1': 'Alice', '2': '12345' },
    ...overrides,
  },
});

describe('TwilioSendWhatsAppAction', () => {
  it('serializes ContentVariables as JSON and prefixes whatsapp: numbers', async () => {
    const call = jest.fn().mockResolvedValue({
      status: 201,
      data: { sid: 'SM2', status: 'queued', to: 'whatsapp:+14155550101' },
    } as TwilioResponse);
    const action = new TwilioSendWhatsAppAction({
      call,
      baseUrl: jest.fn(),
      buildAuthHeader: jest.fn(),
    } as unknown as TwilioClientFactory);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput(), ctx);

    const [, , init] = call.mock.calls[0];
    const body = init.body as URLSearchParams;
    expect(body.get('To')).toBe('whatsapp:+14155550101');
    expect(body.get('From')).toBe('whatsapp:+14155238886');
    expect(body.get('ContentSid')).toBe(VALID_CONTENT_SID);
    expect(body.get('ContentVariables')).toBe(JSON.stringify({ '1': 'Alice', '2': '12345' }));

    expect(result.data.sid).toBe('SM2');
  });

  it('omits ContentVariables when not provided', async () => {
    const call = jest.fn().mockResolvedValue({
      status: 201,
      data: { sid: 'SM2' },
    } as TwilioResponse);
    const action = new TwilioSendWhatsAppAction({
      call,
      baseUrl: jest.fn(),
      buildAuthHeader: jest.fn(),
    } as unknown as TwilioClientFactory);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await action.execute(makeInput({ contentVariables: undefined }), ctx);
    const [, , init] = call.mock.calls[0];
    const body = init.body as URLSearchParams;
    expect(body.get('ContentVariables')).toBeNull();
  });

  it('rejects bad ContentSid format', async () => {
    const call = jest.fn();
    const action = new TwilioSendWhatsAppAction({
      call,
      baseUrl: jest.fn(),
      buildAuthHeader: jest.fn(),
    } as unknown as TwilioClientFactory);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(
      action.execute(makeInput({ contentSid: 'not-a-content-sid' }), ctx),
    ).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('rejects raw E.164 (without whatsapp: prefix)', async () => {
    const call = jest.fn();
    const action = new TwilioSendWhatsAppAction({
      call,
      baseUrl: jest.fn(),
      buildAuthHeader: jest.fn(),
    } as unknown as TwilioClientFactory);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ from: '+14155238886' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});
