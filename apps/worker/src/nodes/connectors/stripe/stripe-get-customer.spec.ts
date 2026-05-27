import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { StripeApiKeyConfig } from '@tietide/shared';
import { StripeGetCustomerAction } from './stripe-get-customer';
import {
  StripeHttpError,
  type StripeClientFactory,
  type StripeResponse,
} from './stripe-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (call: jest.Mock = jest.fn()) =>
  ({
    call,
    baseUrl: jest.fn(),
    buildAuthHeaders: jest.fn(),
  }) as unknown as StripeClientFactory;

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

const makeConnection = (
  overrides: Partial<DecryptedConnection<StripeApiKeyConfig>> = {},
): DecryptedConnection<StripeApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'stripe',
  config: { apiKey: 'sk_test_xyz' },
  refreshToken: undefined,
  ...overrides,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    customerId: 'cus_123',
    ...overrides,
  },
});

describe('StripeGetCustomerAction', () => {
  let call: jest.Mock;
  let action: StripeGetCustomerAction;

  beforeEach(() => {
    call = jest.fn();
    action = new StripeGetCustomerAction(makeClient(call));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('stripe-get-customer');
    expect(action.requiredConnectionType).toBe('stripe');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('GETs /v1/customers/:id and returns the customer', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { id: 'cus_123', email: 'cust@example.com', name: 'Customer' },
      } as StripeResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/v1/customers/cus_123');
      expect(init.method).toBe('GET');
      expect(result.data.id).toBe('cus_123');
      expect((result.data.customer as { email?: string }).email).toBe('cust@example.com');
    });
  });

  describe('error handling', () => {
    it('rethrows 401 when no refresh token', async () => {
      call.mockRejectedValue(new StripeHttpError(401, { error: { message: 'Invalid API Key' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(StripeHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('does not mark for refresh on 404 (missing customer)', async () => {
      call.mockRejectedValue(new StripeHttpError(404, { error: { message: 'No such customer' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(StripeHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a malformed customer id before hitting Stripe', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ customerId: 'not-a-customer' }), ctx),
      ).rejects.toThrow();
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
