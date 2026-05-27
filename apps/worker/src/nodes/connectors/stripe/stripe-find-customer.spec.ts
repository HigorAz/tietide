import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { StripeApiKeyConfig } from '@tietide/shared';
import { StripeFindCustomerAction } from './stripe-find-customer';
import {
  StripeHttpError,
  type StripeClientFactory,
  type StripeResponse,
} from './stripe-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (call: jest.Mock = jest.fn()) =>
  ({ call, baseUrl: jest.fn(), buildAuthHeaders: jest.fn() }) as unknown as StripeClientFactory;

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

const makeConnection = (): DecryptedConnection<StripeApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'stripe',
  config: { apiKey: 'sk_test_xyz' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, email: 'jane@example.com', ...overrides },
});

describe('StripeFindCustomerAction', () => {
  let call: jest.Mock;
  let action: StripeFindCustomerAction;

  beforeEach(() => {
    call = jest.fn();
    action = new StripeFindCustomerAction(makeClient(call));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('stripe-find-customer');
    expect(action.requiredConnectionType).toBe('stripe');
  });

  describe('happy path', () => {
    it('searches by email and returns the first match', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { data: [{ id: 'cus_1', email: 'jane@example.com' }], has_more: false },
      } as StripeResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/v1/customers/search');
      expect(init.method).toBe('GET');
      expect(init.query.query).toBe("email:'jane@example.com'");
      expect(result.data.found).toBe(true);
      expect((result.data.customer as { id?: string }).id).toBe('cus_1');
    });

    it('returns found=false on no match', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { data: [], has_more: false },
      } as StripeResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);
      expect(result.data.found).toBe(false);
      expect(result.data.customer).toBeNull();
    });
  });

  describe('error handling', () => {
    it('rethrows 401 when no refresh token', async () => {
      call.mockRejectedValue(new StripeHttpError(401, { error: { message: 'Invalid API Key' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(StripeHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a malformed email before hitting Stripe', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ email: 'not-email' }), ctx)).rejects.toThrow();
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
