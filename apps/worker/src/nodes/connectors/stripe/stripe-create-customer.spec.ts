import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { StripeApiKeyConfig } from '@tietide/shared';
import { StripeCreateCustomerAction } from './stripe-create-customer';
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
    email: 'cust@example.com',
    name: 'Customer',
    ...overrides,
  },
});

describe('StripeCreateCustomerAction', () => {
  let call: jest.Mock;
  let action: StripeCreateCustomerAction;

  beforeEach(() => {
    call = jest.fn();
    action = new StripeCreateCustomerAction(makeClient(call));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('stripe-create-customer');
    expect(action.requiredConnectionType).toBe('stripe');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('POSTs form-encoded body to /v1/customers', async () => {
      call.mockResolvedValue({
        status: 200,
        data: {
          id: 'cus_123',
          email: 'cust@example.com',
          name: 'Customer',
          metadata: {},
          created: 1715251200,
        },
      } as StripeResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/v1/customers');
      expect(init.method).toBe('POST');
      expect(init.form).toMatchObject({ email: 'cust@example.com', name: 'Customer' });
      expect(result.data.id).toBe('cus_123');
    });

    it('flattens metadata using Stripe bracket notation', async () => {
      call.mockResolvedValue({ status: 200, data: { id: 'cus_2' } } as StripeResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ metadata: { order_id: '42', source: 'web' } }), ctx);
      const [, , init] = call.mock.calls[0];
      expect(init.form['metadata[order_id]']).toBe('42');
      expect(init.form['metadata[source]']).toBe('web');
    });
  });

  describe('error handling', () => {
    it('rethrows 401 when no refresh token', async () => {
      call.mockRejectedValue(new StripeHttpError(401, { error: { message: 'Invalid API Key' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(StripeHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('does not mark for refresh on 400 (validation)', async () => {
      call.mockRejectedValue(new StripeHttpError(400, { error: { message: 'bad' } }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(StripeHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects malformed email before hitting Stripe', async () => {
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
