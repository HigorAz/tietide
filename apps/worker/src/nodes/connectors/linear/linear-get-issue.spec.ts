import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { LinearApiKeyConfig } from '@tietide/shared';
import { LinearGetIssueAction } from './linear-get-issue';
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
  params: { connectionId: VALID_CONNECTION_ID, issueId: ISSUE_ID, ...overrides },
});

describe('LinearGetIssueAction', () => {
  let query: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: LinearGetIssueAction;

  beforeEach(() => {
    query = jest.fn();
    client = makeClient(query);
    action = new LinearGetIssueAction(client as unknown as LinearClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('linear-get-issue');
    expect(action.requiredConnectionType).toBe('linear');
  });

  describe('happy path', () => {
    it('queries issue(id) and maps the result', async () => {
      query.mockResolvedValue({
        status: 200,
        data: {
          issue: { id: ISSUE_ID, identifier: 'ENG-1', title: 'Bug', url: 'https://linear.app/i' },
        },
        errors: null,
      } as LinearGraphQLResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, , variables] = query.mock.calls[0];
      expect(variables).toEqual({ id: ISSUE_ID });
      expect(result.data).toMatchObject({ found: true, id: ISSUE_ID, identifier: 'ENG-1' });
    });

    it('reports found=false when the issue is null', async () => {
      query.mockResolvedValue({
        status: 200,
        data: { issue: null },
        errors: null,
      } as LinearGraphQLResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);
      expect(result.data).toMatchObject({ found: false, id: null });
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
    it('rejects a non-UUID issueId before hitting Linear', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ issueId: 'nope' }), ctx)).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    });
  });
});
