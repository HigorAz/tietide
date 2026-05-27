import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { TwilioApiKeyConfig } from '@tietide/shared';
import { TwilioListMessagesAction } from './twilio-list-messages';
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
  params: { connectionId: VALID_CONNECTION_ID, ...overrides },
});

describe('TwilioListMessagesAction', () => {
  let call: jest.Mock;
  let action: TwilioListMessagesAction;

  beforeEach(() => {
    call = jest.fn();
    action = new TwilioListMessagesAction(makeClient(call) as unknown as TwilioClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('twilio-list-messages');
    expect(action.requiredConnectionType).toBe('twilio');
  });

  it('GETs Messages.json with filters + PageSize and maps the list', async () => {
    call.mockResolvedValue({
      status: 200,
      data: {
        messages: [{ sid: 'SM1', status: 'delivered', to: '+14155551212', from: '+15558675309' }],
      },
    });

    const result = await action.execute(
      makeInput({ to: '+14155551212', pageSize: 5 }),
      makeContext(),
    );

    const [, path, init] = call.mock.calls[0];
    expect(path).toContain(`/2010-04-01/Accounts/${SID}/Messages.json?`);
    expect(path).toContain('To=%2B14155551212');
    expect(path).toContain('PageSize=5');
    expect(init.method).toBe('GET');
    expect(result.data.count).toBe(1);
    expect((result.data.messages as unknown[])[0]).toMatchObject({
      sid: 'SM1',
      status: 'delivered',
    });
  });

  it('defaults PageSize to 20 when not provided', async () => {
    call.mockResolvedValue({ status: 200, data: { messages: [] } });
    await action.execute(makeInput(), makeContext());
    expect(call.mock.calls[0][1]).toContain('PageSize=20');
  });

  it('surfaces TwilioHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new TwilioHttpError(401, { message: 'Authenticate' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(TwilioHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects a malformed "to" filter before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ to: '5551212' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});
