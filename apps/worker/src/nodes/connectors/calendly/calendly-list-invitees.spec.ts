import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { CalendlyApiKeyConfig } from '@tietide/shared';
import { CalendlyListInviteesAction } from './calendly-list-invitees';
import {
  CalendlyHttpError,
  type CalendlyClientFactory,
  type CalendlyResponse,
} from './calendly-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (call: jest.Mock = jest.fn()) =>
  ({ call, baseUrl: jest.fn(), buildAuthHeaders: jest.fn() }) as unknown as CalendlyClientFactory;

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

const makeConnection = (): DecryptedConnection<CalendlyApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'calendly',
  config: { apiKey: 'cal_token' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, eventUuid: 'EVT-123', ...overrides },
});

describe('CalendlyListInviteesAction', () => {
  let call: jest.Mock;
  let action: CalendlyListInviteesAction;

  beforeEach(() => {
    call = jest.fn();
    action = new CalendlyListInviteesAction(makeClient(call));
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('calendly-list-invitees');
    expect(action.requiredConnectionType).toBe('calendly');
  });

  describe('happy path', () => {
    it('GETs /scheduled_events/:uuid/invitees with count + status', async () => {
      call.mockResolvedValue({
        status: 200,
        data: {
          collection: [{ email: 'a@x.com' }, { email: 'b@x.com' }],
          pagination: { next_page: null },
        },
      } as CalendlyResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ status: 'active' }), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/scheduled_events/EVT-123/invitees');
      expect(init.method).toBe('GET');
      expect(init.query).toMatchObject({ count: '20', status: 'active' });
      expect(result.data.count).toBe(2);
    });
  });

  describe('error handling', () => {
    it('rethrows 401 when no refresh token', async () => {
      call.mockRejectedValue(new CalendlyHttpError(401, { message: 'unauthorized' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(CalendlyHttpError);
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
