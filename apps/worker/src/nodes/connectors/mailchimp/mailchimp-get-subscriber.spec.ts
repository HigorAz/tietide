import { createHash } from 'crypto';
import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpGetSubscriberAction } from './mailchimp-get-subscriber';
import {
  MailchimpHttpError,
  type MailchimpClientFactory,
  type MailchimpResponse,
} from './mailchimp-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const JANE_HASH = createHash('md5').update('jane@example.com').digest('hex');

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
  params: {
    connectionId: VALID_CONNECTION_ID,
    listId: 'abc123',
    email: 'jane@example.com',
    ...overrides,
  },
});

describe('MailchimpGetSubscriberAction', () => {
  let call: jest.Mock;
  let action: MailchimpGetSubscriberAction;

  beforeEach(() => {
    call = jest.fn();
    action = new MailchimpGetSubscriberAction(makeClient(call));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('mailchimp-get-subscriber');
    expect(action.requiredConnectionType).toBe('mailchimp');
  });

  describe('happy path', () => {
    it('GETs the member by md5(lowercase(email)) hash', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { id: JANE_HASH, email_address: 'jane@example.com', status: 'subscribed' },
      } as MailchimpResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe(`/lists/abc123/members/${JANE_HASH}`);
      expect(init.method).toBe('GET');
      expect(result.data.status).toBe('subscribed');
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
    it('rejects a malformed email', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ email: 'nope' }), ctx)).rejects.toThrow();
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
