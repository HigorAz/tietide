import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpListCampaignsAction } from './mailchimp-list-campaigns';
import {
  MailchimpHttpError,
  type MailchimpClientFactory,
  type MailchimpResponse,
} from './mailchimp-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (call: jest.Mock = jest.fn()) =>
  ({ call, baseUrl: jest.fn(), buildAuthHeaders: jest.fn() }) as unknown as MailchimpClientFactory;

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

const makeConnection = (): DecryptedConnection<MailchimpApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'mailchimp',
  config: { apiKey: 'key-us1', dataCenter: 'us1' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, ...overrides },
});

describe('MailchimpListCampaignsAction', () => {
  let call: jest.Mock;
  let action: MailchimpListCampaignsAction;

  beforeEach(() => {
    call = jest.fn();
    action = new MailchimpListCampaignsAction(makeClient(call));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('mailchimp-list-campaigns');
    expect(action.requiredConnectionType).toBe('mailchimp');
  });

  describe('happy path', () => {
    it('GETs /campaigns with count and status query', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { campaigns: [{ id: 'c1' }, { id: 'c2' }], total_items: 2 },
      } as MailchimpResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ status: 'sent' }), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toContain('/campaigns?');
      expect(path).toContain('count=10');
      expect(path).toContain('status=sent');
      expect(init.method).toBe('GET');
      expect(result.data.count).toBe(2);
    });
  });

  describe('error handling', () => {
    it('rethrows 401 when no refresh token', async () => {
      call.mockRejectedValue(new MailchimpHttpError(401, { detail: 'API key invalid' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(MailchimpHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects an invalid status', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ status: 'bogus' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('skips network call on dry-run + mockOnDryRun', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(call).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
