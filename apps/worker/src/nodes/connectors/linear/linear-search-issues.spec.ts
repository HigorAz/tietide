import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { LinearApiKeyConfig } from '@tietide/shared';
import { LinearSearchIssuesAction } from './linear-search-issues';
import {
  LinearHttpError,
  type LinearClientFactory,
  type LinearGraphQLResponse,
} from './linear-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const TEAM_ID = '22222222-2222-4222-8222-222222222222';

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
  params: { connectionId: VALID_CONNECTION_ID, term: 'login bug', ...overrides },
});

describe('LinearSearchIssuesAction', () => {
  let query: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: LinearSearchIssuesAction;

  beforeEach(() => {
    query = jest.fn();
    client = makeClient(query);
    action = new LinearSearchIssuesAction(client as unknown as LinearClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('linear-search-issues');
    expect(action.requiredConnectionType).toBe('linear');
  });

  describe('happy path', () => {
    it('searches issues by title containsIgnoreCase', async () => {
      query.mockResolvedValue({
        status: 200,
        data: { issues: { nodes: [{ id: 'i1' }, { id: 'i2' }] } },
        errors: null,
      } as LinearGraphQLResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ first: 10 }), ctx);

      const [, , variables] = query.mock.calls[0];
      expect(variables).toMatchObject({
        filter: { title: { containsIgnoreCase: 'login bug' } },
        first: 10,
      });
      expect(result.data.count).toBe(2);
    });

    it('adds a team filter when teamId is given', async () => {
      query.mockResolvedValue({
        status: 200,
        data: { issues: { nodes: [] } },
        errors: null,
      } as LinearGraphQLResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ teamId: TEAM_ID }), ctx);
      const [, , variables] = query.mock.calls[0];
      expect((variables as { filter: Record<string, unknown> }).filter.team).toEqual({
        id: { eq: TEAM_ID },
      });
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
    it('rejects an empty search term before hitting Linear', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ term: '' }), ctx)).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    });
  });
});
