import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { CalendlyApiKeyConfig } from '@tietide/shared';
import { CalendlyListEventsAction } from './calendly-list-events';
import {
  CalendlyHttpError,
  type CalendlyClientFactory,
  type CalendlyResponse,
} from './calendly-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (call: jest.Mock = jest.fn()) =>
  ({
    call,
    baseUrl: jest.fn(),
    buildAuthHeaders: jest.fn(),
  }) as unknown as CalendlyClientFactory;

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

const makeConnection = (): DecryptedConnection<CalendlyApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'calendly',
  config: { apiKey: 'pat_xxx' },
  refreshToken: undefined,
});

const VALID_USER_URI = 'https://api.calendly.com/users/abc-123';

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    userUri: VALID_USER_URI,
    ...overrides,
  },
});

describe('CalendlyListEventsAction', () => {
  let call: jest.Mock;
  let action: CalendlyListEventsAction;

  beforeEach(() => {
    call = jest.fn();
    action = new CalendlyListEventsAction(makeClient(call));
  });

  it('declares correct type', () => {
    expect(action.type).toBe('calendly-list-events');
    expect(action.requiredConnectionType).toBe('calendly');
  });

  it('GETs /scheduled_events with user + count query params', async () => {
    call.mockResolvedValue({
      status: 200,
      data: {
        collection: [{ uri: 'event-1' }, { uri: 'event-2' }],
        pagination: { count: 2, next_page: null },
      },
    } as CalendlyResponse);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput({ count: 10 }), ctx);

    const [, path, init] = call.mock.calls[0];
    expect(path).toBe('/scheduled_events');
    expect(init.query.user).toBe(VALID_USER_URI);
    expect(init.query.count).toBe('10');
    expect(result.data.count).toBe(2);
  });

  it('rejects malformed userUri', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ userUri: 'not-url' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it('rethrows non-auth errors', async () => {
    call.mockRejectedValue(new CalendlyHttpError(500, { message: 'down' }));
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(CalendlyHttpError);
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
