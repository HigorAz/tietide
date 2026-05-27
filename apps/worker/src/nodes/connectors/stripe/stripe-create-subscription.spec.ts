import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { StripeApiKeyConfig } from '@tietide/shared';
import { StripeCreateSubscriptionAction } from './stripe-create-subscription';
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
  params: {
    connectionId: VALID_CONNECTION_ID,
    customerId: 'cus_123',
    priceId: 'price_123',
    ...overrides,
  },
});

describe('StripeCreateSubscriptionAction', () => {
  let call: jest.Mock;
  let action: StripeCreateSubscriptionAction;

  beforeEach(() => {
    call = jest.fn();
    action = new StripeCreateSubscriptionAction(makeClient(call));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('stripe-create-subscription');
    expect(action.requiredConnectionType).toBe('stripe');
  });

  describe('happy path', () => {
    it('POSTs items[0][price] to /v1/subscriptions', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { id: 'sub_1', status: 'active', customer: 'cus_123' },
      } as StripeResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ quantity: 2 }), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/v1/subscriptions');
      expect(init.method).toBe('POST');
      expect(init.form).toMatchObject({
        customer: 'cus_123',
        'items[0][price]': 'price_123',
        'items[0][quantity]': '2',
      });
      expect(result.data.id).toBe('sub_1');
    });
  });

  describe('error handling', () => {
    it('rethrows 401 when no refresh token', async () => {
      call.mockRejectedValue(new StripeHttpError(401, { error: { message: 'unauthorized' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(StripeHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a malformed price id', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ priceId: 'bogus' }), ctx)).rejects.toThrow();
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
