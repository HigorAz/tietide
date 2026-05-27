import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TwilioApiKeyConfig } from '@tietide/shared';
import { TwilioGetMessageAction } from './twilio-get-message';
import { TwilioHttpError, type TwilioClientFactory } from './twilio-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const SID = 'AC00000000000000000000000000000000';
const MSG_SID = 'SM11111111111111111111111111111111';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<TwilioClientFactory, 'call' | 'baseUrl' | 'buildAuthHeader'>> => ({
  call,
  baseUrl: jest.fn(),
  buildAuthHeader: jest.fn(),
});

function makeConnection(): DecryptedConnection<TwilioApiKeyConfig> {
  return {
    id: VALID_CONNECTION_ID,
    type: 'API_KEY',
    provider: 'twilio',
    config: { accountSid: SID, authToken: 'tok' },
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
  params: { connectionId: VALID_CONNECTION_ID, messageSid: MSG_SID, ...overrides },
});

describe('TwilioGetMessageAction', () => {
  let call: jest.Mock;
  let action: TwilioGetMessageAction;

  beforeEach(() => {
    call = jest.fn();
    action = new TwilioGetMessageAction(makeClient(call) as unknown as TwilioClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('twilio-get-message');
    expect(action.requiredConnectionType).toBe('twilio');
  });

  it('GETs the message resource and returns delivery status', async () => {
    call.mockResolvedValue({
      status: 200,
      data: {
        sid: MSG_SID,
        status: 'delivered',
        to: '+14155551212',
        from: '+15558675309',
        body: 'hi',
      },
    });

    const result = await action.execute(makeInput(), makeContext());

    const [, path, init] = call.mock.calls[0];
    expect(path).toBe(`/2010-04-01/Accounts/${SID}/Messages/${MSG_SID}.json`);
    expect(init.method).toBe('GET');
    expect(result.data.status).toBe('delivered');
    expect(result.data.sid).toBe(MSG_SID);
  });

  it('surfaces TwilioHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new TwilioHttpError(401, { message: 'Authenticate' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TwilioHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects a malformed messageSid before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ messageSid: 'nope' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});
