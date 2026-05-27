import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TwilioApiKeyConfig } from '@tietide/shared';
import { TwilioMakeCallAction } from './twilio-make-call';
import { TwilioHttpError, type TwilioClientFactory } from './twilio-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const SID = 'AC00000000000000000000000000000000';

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
  params: {
    connectionId: VALID_CONNECTION_ID,
    to: '+14155551212',
    from: '+15558675309',
    url: 'https://demo.twilio.com/welcome/voice/',
    ...overrides,
  },
});

describe('TwilioMakeCallAction', () => {
  let call: jest.Mock;
  let action: TwilioMakeCallAction;

  beforeEach(() => {
    call = jest.fn();
    action = new TwilioMakeCallAction(makeClient(call) as unknown as TwilioClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('twilio-make-call');
    expect(action.requiredConnectionType).toBe('twilio');
  });

  it('POSTs URL-encoded form to Calls.json with To/From/Url', async () => {
    call.mockResolvedValue({
      status: 201,
      data: { sid: 'CA1', status: 'queued', to: '+14155551212' },
    });

    const result = await action.execute(makeInput(), makeContext());

    const [, path, init] = call.mock.calls[0];
    expect(path).toBe(`/2010-04-01/Accounts/${SID}/Calls.json`);
    expect(init.method).toBe('POST');
    const body = init.body as URLSearchParams;
    expect(body.get('To')).toBe('+14155551212');
    expect(body.get('From')).toBe('+15558675309');
    expect(body.get('Url')).toBe('https://demo.twilio.com/welcome/voice/');
    expect(result.data).toEqual({
      sid: 'CA1',
      status: 'queued',
      to: '+14155551212',
      from: '+15558675309',
    });
  });

  it('surfaces TwilioHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new TwilioHttpError(401, { message: 'Authenticate' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TwilioHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects when both url and twiml are provided', async () => {
    const ctx = makeContext();
    await expect(
      action.execute(makeInput({ twiml: '<Response><Say>Hi</Say></Response>' }), ctx),
    ).rejects.toThrow();
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
