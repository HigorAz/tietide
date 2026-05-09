import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { LinearApiKeyConfig } from '@tietide/shared';
import { LinearCreateIssueAction } from './linear-create-issue';
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

const makeConnection = (): DecryptedConnection<LinearApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'linear',
  config: { apiKey: 'lin_api_AAA111' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    teamId: TEAM_ID,
    title: 'New issue from workflow',
    ...overrides,
  },
});

describe('LinearCreateIssueAction', () => {
  let query: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: LinearCreateIssueAction;

  beforeEach(() => {
    query = jest.fn();
    client = makeClient(query);
    action = new LinearCreateIssueAction(client as unknown as LinearClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('linear-create-issue');
    expect(action.requiredConnectionType).toBe('linear');
  });

  describe('happy path', () => {
    it('runs IssueCreate mutation and returns identifier/url', async () => {
      query.mockResolvedValue({
        status: 200,
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: 'iss-1',
              identifier: 'ENG-12',
              url: 'https://linear.app/team/issue/ENG-12',
              title: 'New issue from workflow',
            },
          },
        },
        errors: null,
      } as LinearGraphQLResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ description: 'body', priority: 1 }), ctx);

      const [, mutation, vars] = query.mock.calls[0];
      expect(mutation).toContain('issueCreate');
      expect(vars).toEqual({
        input: {
          teamId: TEAM_ID,
          title: 'New issue from workflow',
          description: 'body',
          priority: 1,
        },
      });
      expect(result.data).toEqual({
        success: true,
        id: 'iss-1',
        identifier: 'ENG-12',
        url: 'https://linear.app/team/issue/ENG-12',
        title: 'New issue from workflow',
      });
    });
  });

  describe('error handling', () => {
    it('rethrows LinearHttpError(401) when underlying GraphQL surfaces auth error', async () => {
      query.mockRejectedValue(new LinearHttpError(401, { errors: [{ message: 'auth' }] }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(LinearHttpError);
    });
  });

  describe('schema rejection', () => {
    it('rejects empty title', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ title: '' }), ctx)).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data without hitting Linear', async () => {
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
