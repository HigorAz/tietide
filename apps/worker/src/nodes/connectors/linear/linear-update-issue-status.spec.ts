import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { LinearApiKeyConfig } from '@tietide/shared';
import { LinearUpdateIssueStatusAction } from './linear-update-issue-status';
import {
  LinearHttpError,
  type LinearClientFactory,
  type LinearGraphQLResponse,
} from './linear-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const ISSUE_ID = '33333333-3333-4333-8333-333333333333';
const STATE_ID = '44444444-4444-4444-8444-444444444444';

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
    issueId: ISSUE_ID,
    stateId: STATE_ID,
    ...overrides,
  },
});

describe('LinearUpdateIssueStatusAction', () => {
  let query: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: LinearUpdateIssueStatusAction;

  beforeEach(() => {
    query = jest.fn();
    client = makeClient(query);
    action = new LinearUpdateIssueStatusAction(client as unknown as LinearClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('linear-update-issue-status');
    expect(action.requiredConnectionType).toBe('linear');
  });

  describe('happy path', () => {
    it('runs IssueUpdate with id + stateId', async () => {
      query.mockResolvedValue({
        status: 200,
        data: {
          issueUpdate: {
            success: true,
            issue: {
              id: ISSUE_ID,
              identifier: 'ENG-1',
              url: 'https://linear.app/team/issue/ENG-1',
              state: { id: STATE_ID, name: 'In Progress' },
            },
          },
        },
        errors: null,
      } as LinearGraphQLResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, mutation, vars] = query.mock.calls[0];
      expect(mutation).toContain('issueUpdate');
      expect(vars).toEqual({ id: ISSUE_ID, input: { stateId: STATE_ID } });
      expect(result.data.stateName).toBe('In Progress');
    });
  });

  describe('error handling', () => {
    it('rethrows LinearHttpError on bad GraphQL', async () => {
      query.mockRejectedValue(new LinearHttpError(400, { errors: [{ message: 'bad' }] }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(LinearHttpError);
    });
  });

  describe('schema rejection', () => {
    it('rejects non-UUID stateId', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ stateId: 'not-a-uuid' }), ctx)).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    });
  });
});
