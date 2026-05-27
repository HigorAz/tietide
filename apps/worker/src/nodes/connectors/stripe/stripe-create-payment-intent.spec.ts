import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { StripeApiKeyConfig } from '@tietide/shared';
import { StripeCreatePaymentIntentAction } from './stripe-create-payment-intent';
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
  params: { connectionId: VALID_CONNECTION_ID, amount: 2000, currency: 'usd', ...overrides },
});

describe('StripeCreatePaymentIntentAction', () => {
  let call: jest.Mock;
  let action: StripeCreatePaymentIntentAction;

  beforeEach(() => {
    call = jest.fn();
    action = new StripeCreatePaymentIntentAction(makeClient(call));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('stripe-create-payment-intent');
    expect(action.requiredConnectionType).toBe('stripe');
  });

  describe('happy path', () => {
    it('POSTs form-encoded amount + currency to /v1/payment_intents', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { id: 'pi_1', status: 'requires_payment_method', client_secret: 'pi_1_secret' },
      } as StripeResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ customerId: 'cus_9' }), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/v1/payment_intents');
      expect(init.method).toBe('POST');
      expect(init.form).toMatchObject({ amount: '2000', currency: 'usd', customer: 'cus_9' });
      expect(result.data.id).toBe('pi_1');
      expect(result.data.clientSecret).toBe('pi_1_secret');
    });

    it('lowercases the currency code', async () => {
      call.mockResolvedValue({ status: 200, data: { id: 'pi_2' } } as StripeResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ currency: 'EUR' }), ctx);
      const [, , init] = call.mock.calls[0];
      expect(init.form.currency).toBe('eur');
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
    it('rejects a non-positive amount', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ amount: 0 }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });

    it('rejects a malformed currency', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ currency: 'dollars' }), ctx)).rejects.toThrow();
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
