import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { StripeApiKeyConfig } from '@tietide/shared';
import { StripeListChargesAction } from './stripe-list-charges';
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

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext => {
  return {
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSecret: jest.fn(),
    getConnection: jest.fn(),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ExecutionContext;
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
  params: { connectionId: VALID_CONNECTION_ID, ...overrides },
});

describe('StripeListChargesAction', () => {
  let call: jest.Mock;
  let action: StripeListChargesAction;

  beforeEach(() => {
    call = jest.fn();
    action = new StripeListChargesAction(makeClient(call));
  });

  it('declares correct type', () => {
    expect(action.type).toBe('stripe-list-charges');
    expect(action.requiredConnectionType).toBe('stripe');
  });

  it('GETs /v1/charges with limit and customer query params', async () => {
    call.mockResolvedValue({
      status: 200,
      data: { data: [{ id: 'ch_1' }, { id: 'ch_2' }], has_more: false },
    } as StripeResponse);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput({ customerId: 'cus_123', limit: 25 }), ctx);

    const [, path, init] = call.mock.calls[0];
    expect(path).toBe('/v1/charges');
    expect(init.method).toBe('GET');
    expect(init.query).toEqual({ limit: '25', customer: 'cus_123' });
    expect((result.data.charges as unknown[]).length).toBe(2);
    expect(result.data.hasMore).toBe(false);
  });

  it('rejects malformed customerId', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ customerId: 'invalid' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('rejects limit > 100', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ limit: 200 }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('rethrows non-auth errors verbatim', async () => {
    call.mockRejectedValue(new StripeHttpError(500, { error: { message: 'down' } }));
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(StripeHttpError);
  });

  it('returns mocked data on dry-run + mockOnDryRun', async () => {
    const ctx = makeContext({
      isDryRun: true,
      getConnection: jest.fn().mockResolvedValue(makeConnection()),
    });
    const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
    expect(call).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
