import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TwilioApiKeyConfig } from '@tietide/shared';
import { TwilioSendSmsAction } from './twilio-send-sms';
import {
  TwilioHttpError,
  type TwilioClientFactory,
  type TwilioResponse,
} from './twilio-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '33333333-3333-4333-8333-333333333333';
const TWILIO_ACCOUNT_SID = 'AC-fakefakefakefakefakefakefakefak';

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
    from: '+14155550100',
    to: '+14155550101',
    body: 'hello',
    ...overrides,
  },
});

describe('TwilioSendSmsAction', () => {
  it('POSTs URL-encoded form to /Accounts/<sid>/Messages.json and returns sid/status', async () => {
    const call = jest.fn().mockResolvedValue({
      status: 201,
      data: {
        sid: 'SM1',
        status: 'queued',
        to: '+14155550101',
        from: '+14155550100',
      },
    } as TwilioResponse);
    const action = new TwilioSendSmsAction({
      call,
      baseUrl: jest.fn(),
      buildAuthHeader: jest.fn(),
    } as unknown as TwilioClientFactory);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput(), ctx);

    expect(call).toHaveBeenCalledTimes(1);
    const [, path, init] = call.mock.calls[0];
    expect(path).toBe(`/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`);
    expect(init.method).toBe('POST');
    const body = init.body as URLSearchParams;
    expect(body.get('To')).toBe('+14155550101');
    expect(body.get('From')).toBe('+14155550100');
    expect(body.get('Body')).toBe('hello');

    expect(result.data.sid).toBe('SM1');
    expect(result.data.status).toBe('queued');
  });

  it('rejects non-E.164 to/from before calling Twilio', async () => {
    const call = jest.fn();
    const action = new TwilioSendSmsAction({
      call,
      baseUrl: jest.fn(),
      buildAuthHeader: jest.fn(),
    } as unknown as TwilioClientFactory);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ to: '4155550101' }), ctx)).rejects.toThrow();
    await expect(action.execute(makeInput({ from: '+abc' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  // Twilio uses static API_KEY credentials (accountSid + authToken) — there is no
  // refresh-token flow, so BaseConnectorAction's refresh path is correctly skipped.
  it('surfaces TwilioHttpError(401) verbatim when authToken is invalid', async () => {
    const call = jest
      .fn()
      .mockRejectedValue(new TwilioHttpError(401, { message: 'Authentication required' }));
    const action = new TwilioSendSmsAction({
      call,
      baseUrl: jest.fn(),
      buildAuthHeader: jest.fn(),
    } as unknown as TwilioClientFactory);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TwilioHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('returns mocked output on dry-run with mockOnDryRun=true', async () => {
    const call = jest.fn();
    const action = new TwilioSendSmsAction({
      call,
      baseUrl: jest.fn(),
      buildAuthHeader: jest.fn(),
    } as unknown as TwilioClientFactory);
    const ctx = makeContext({
      isDryRun: true,
      getConnection: jest.fn().mockResolvedValue(makeConnection()),
    });
    const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
    expect(call).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
