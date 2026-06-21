import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { GitHubOAuth2Config } from '@tietide/shared';
import { GitHubMergePrAction } from './github-merge-pr';
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

const makeConnection = (
  overrides: Partial<DecryptedConnection<GitHubOAuth2Config>> = {},
): DecryptedConnection<GitHubOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'github',
  config: { accessToken: 'gho_AAAA1111', scope: 'repo', tokenType: 'bearer' },
  refreshToken: undefined,
  ...overrides,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    owner: 'octocat',
    repo: 'hello-world',
    pullNumber: 12,
    ...overrides,
  },
});

describe('GitHubMergePrAction', () => {
  let call: jest.Mock;
  let client: ReturnType<typeof makeClient>;
  let action: GitHubMergePrAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new GitHubMergePrAction(client as unknown as GitHubClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('github-merge-pr');
    expect(action.requiredConnectionType).toBe('github');
  });

  describe('happy path', () => {
    it('PUTs the merge endpoint with merge_method', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { sha: 'abc123', merged: true, message: 'Pull Request successfully merged' },
      } as GitHubResponse);

      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ mergeMethod: 'squash' }), ctx);

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/repos/octocat/hello-world/pulls/12/merge');
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body as string)).toEqual({ merge_method: 'squash' });
      expect(result.data).toMatchObject({ merged: true, sha: 'abc123' });
    });
  });

  describe('auth and error handling', () => {
    it('rethrows GitHubHttpError(401) verbatim when no refresh token', async () => {
      call.mockRejectedValue(new GitHubHttpError(401, { message: 'Bad credentials' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(GitHubHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('marks for refresh and wraps in ConnectionAuthError when refresh token present', async () => {
      call.mockRejectedValue(new GitHubHttpError(403, { message: 'Forbidden' }));
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt-present' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });
  });

  describe('templatable mergeMethod (fx/expression mode)', () => {
    it('accepts a {{pill}} template in the mergeMethod field', async () => {
      // templatable() lets the merge-method enum field also hold a {{pill}};
      // the unresolved token passes the schema and flows into the payload here
      // (the engine resolves it before execution in the real path).
      call.mockResolvedValue({
        status: 200,
        data: { sha: 'abc', merged: true },
      } as GitHubResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ mergeMethod: '{{ trigger.method }}' }), ctx);
      expect(JSON.parse(call.mock.calls[0][2].body as string)).toEqual({
        merge_method: '{{ trigger.method }}',
      });
    });
  });

  describe('schema rejection', () => {
    it('rejects an invalid merge method before hitting GitHub', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ mergeMethod: 'fast-forward' }), ctx),
      ).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data without hitting GitHub on a dry run', async () => {
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
