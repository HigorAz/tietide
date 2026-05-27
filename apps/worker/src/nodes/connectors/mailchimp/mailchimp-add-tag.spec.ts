import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpAddTagAction } from './mailchimp-add-tag';
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
  params: {
    connectionId: VALID_CONNECTION_ID,
    listId: 'abc123',
    email: 'jane@example.com',
    tags: ['vip'],
    ...overrides,
  },
});

describe('MailchimpAddTagAction', () => {
  let call: jest.Mock;
  let action: MailchimpAddTagAction;

  beforeEach(() => {
    call = jest.fn();
    action = new MailchimpAddTagAction(makeClient(call));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('mailchimp-add-tag');
    expect(action.requiredConnectionType).toBe('mailchimp');
  });

  describe('happy path', () => {
    it('POSTs active tags to the member tags endpoint', async () => {
      call.mockResolvedValue({ status: 204, data: null } as MailchimpResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ tags: ['vip', 'lead'] }), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toMatch(/^\/lists\/abc123\/members\/[a-f0-9]{32}\/tags$/);
      expect(init.method).toBe('POST');
      const payload = JSON.parse(init.body as string);
      expect(payload.tags).toEqual([
        { name: 'vip', status: 'active' },
        { name: 'lead', status: 'active' },
      ]);
      expect(result.data.tagged).toBe(true);
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
    it('rejects an empty tags array', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ tags: [] }), ctx)).rejects.toThrow();
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
