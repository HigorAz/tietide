import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { GitHubOAuth2Config } from '@tietide/shared';
import { GitHubCommentIssueAction } from './github-comment-issue';
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
    issueNumber: 7,
    body: 'Looking into it.',
    ...overrides,
  },
});

describe('GitHubCommentIssueAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: GitHubCommentIssueAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new GitHubCommentIssueAction(client as unknown as GitHubClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('github-comment-issue');
    expect(action.requiredConnectionType).toBe('github');
  });

  describe('happy path', () => {
    it('POSTs /repos/:o/:r/issues/:n/comments', async () => {
      call.mockResolvedValue({
        status: 201,
        data: {
          id: 9876,
          html_url: 'https://github.com/octocat/hello-world/issues/7#issuecomment-9876',
          body: 'Looking into it.',
        },
      } as GitHubResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/repos/octocat/hello-world/issues/7/comments');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ body: 'Looking into it.' });
      expect(result.data.id).toBe(9876);
    });
  });

  describe('error handling', () => {
    it('rethrows GitHubHttpError on 404', async () => {
      call.mockRejectedValue(new GitHubHttpError(404, { message: 'Not Found' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(GitHubHttpError);
    });
  });

  describe('schema rejection', () => {
    it('rejects empty body', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ body: '' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });
});
