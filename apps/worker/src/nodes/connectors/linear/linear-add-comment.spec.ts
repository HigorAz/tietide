import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { LinearApiKeyConfig } from '@tietide/shared';
import { LinearAddCommentAction } from './linear-add-comment';
import {
  LinearHttpError,
  type LinearClientFactory,
  type LinearGraphQLResponse,
} from './linear-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const ISSUE_ID = '22222222-2222-4222-8222-222222222222';

const makeClient = (
  query: jest.Mock = jest.fn(),
): jest.Mocked<Pick<LinearClientFactory, 'query' | 'endpointUrl' | 'buildAuthHeader'>> => ({
  query,
  endpointUrl: jest.fn(),
  buildAuthHeader: jest.fn(),
});

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
  overrides: Partial<DecryptedConnection<LinearApiKeyConfig>> = {},
): DecryptedConnection<LinearApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'linear',
  config: { apiKey: 'lin_api_AAA111' },
  refreshToken: undefined,
  ...overrides,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    issueId: ISSUE_ID,
    body: 'Looks good',
    ...overrides,
  },
});

describe('LinearAddCommentAction', () => {
  let query: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: LinearAddCommentAction;

  beforeEach(() => {
    query = jest.fn();
    client = makeClient(query);
    action = new LinearAddCommentAction(client as unknown as LinearClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('linear-add-comment');
    expect(action.requiredConnectionType).toBe('linear');
  });

  describe('happy path', () => {
    it('runs commentCreate with the issueId + body', async () => {
      query.mockResolvedValue({
        status: 200,
        data: {
          commentCreate: { success: true, comment: { id: 'c1', url: 'https://linear.app/c' } },
        },
        errors: null,
      } as LinearGraphQLResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, , variables] = query.mock.calls[0];
      expect(variables).toEqual({ input: { issueId: ISSUE_ID, body: 'Looks good' } });
      expect(result.data).toMatchObject({ success: true, id: 'c1' });
    });
  });

  describe('auth and error handling', () => {
    it('rethrows LinearHttpError(401) verbatim when no refresh token', async () => {
      query.mockRejectedValue(new LinearHttpError(401, null));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(LinearHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('marks for refresh and wraps in ConnectionAuthError when refresh token present', async () => {
      query.mockRejectedValue(new LinearHttpError(401, null));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt-present' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });
  });

  describe('schema rejection', () => {
    it('rejects an empty body before hitting Linear', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ body: '' }), ctx)).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data without hitting Linear on a dry run', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(query).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
