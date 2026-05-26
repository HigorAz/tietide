import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { GitHubOAuth2Config } from '@tietide/shared';
import { GitHubCreateIssueAction } from './github-create-issue';
import {
  GitHubHttpError,
  type GitHubClientFactory,
  type GitHubResponse,
} from './github-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<GitHubClientFactory, 'call' | 'baseUrl' | 'buildAuthHeaders'>> => ({
  call,
  baseUrl: jest.fn(),
  buildAuthHeaders: jest.fn(),
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

const makeConnection = (): DecryptedConnection<GitHubOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'github',
  config: { accessToken: 'gho_AAAA1111BBBB2222', scope: 'repo,read:user', tokenType: 'bearer' },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    owner: 'octocat',
    repo: 'hello-world',
    title: 'Bug: nothing works',
    ...overrides,
  },
});

describe('GitHubCreateIssueAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: GitHubCreateIssueAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new GitHubCreateIssueAction(client as unknown as GitHubClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('github-create-issue');
    expect(action.requiredConnectionType).toBe('github');
  });

  describe('happy path', () => {
    it('POSTs /repos/:owner/:repo/issues and returns number/url', async () => {
      call.mockResolvedValue({
        status: 201,
        data: {
          id: 12345,
          number: 7,
          html_url: 'https://github.com/octocat/hello-world/issues/7',
          state: 'open',
          title: 'Bug: nothing works',
        },
      } as GitHubResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ body: 'Repro: ...', labels: ['bug'], assignees: ['octocat'] }),
        ctx,
      );

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/repos/octocat/hello-world/issues');
      expect(init.method).toBe('POST');
      const payload = JSON.parse(init.body as string);
      expect(payload).toEqual({
        title: 'Bug: nothing works',
        body: 'Repro: ...',
        labels: ['bug'],
        assignees: ['octocat'],
      });
      expect(result.data.number).toBe(7);
    });
  });

  describe('error handling', () => {
    it('rethrows GitHubHttpError on 401', async () => {
      call.mockRejectedValue(new GitHubHttpError(401, { message: 'Bad credentials' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(GitHubHttpError);
    });
  });

  describe('schema rejection', () => {
    it('rejects invalid owner', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ owner: '-bad-' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data without API call', async () => {
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
