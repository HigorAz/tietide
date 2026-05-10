import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpSendCampaignAction } from './mailchimp-send-campaign';
import {
  MailchimpHttpError,
  type MailchimpClientFactory,
  type MailchimpResponse,
} from './mailchimp-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (call: jest.Mock = jest.fn()) =>
  ({
    call,
    baseUrl: jest.fn(),
    buildAuthHeaders: jest.fn(),
  }) as unknown as MailchimpClientFactory;

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext =>
  ({
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSecret: jest.fn(),
    getConnection: jest.fn(),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ExecutionContext;

const makeConnection = (): DecryptedConnection<MailchimpApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'mailchimp',
  config: { apiKey: 'abc-us1', dataCenter: 'us1' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    campaignId: 'cmpgn123',
    ...overrides,
  },
});

describe('MailchimpSendCampaignAction', () => {
  let call: jest.Mock;
  let action: MailchimpSendCampaignAction;

  beforeEach(() => {
    call = jest.fn();
    action = new MailchimpSendCampaignAction(makeClient(call));
  });

  it('POSTs to /campaigns/:id/actions/send', async () => {
    call.mockResolvedValue({ status: 204, data: {} } as MailchimpResponse);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput(), ctx);
    const [, path, init] = call.mock.calls[0];
    expect(path).toBe('/campaigns/cmpgn123/actions/send');
    expect(init.method).toBe('POST');
    expect(result.data.sent).toBe(true);
  });

  it('rejects malformed campaignId', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ campaignId: '!!!' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('rethrows non-auth errors', async () => {
    call.mockRejectedValue(new MailchimpHttpError(500, { detail: 'down' }));
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(MailchimpHttpError);
  });

  it('returns mocked data on dry-run', async () => {
    const ctx = makeContext({
      isDryRun: true,
      getConnection: jest.fn().mockResolvedValue(makeConnection()),
    });
    const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
    expect(call).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
