import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { SlackOAuth2Config } from '@tietide/shared';
import { SlackFindUserAction } from './slack-find-user';
import {
  SlackHttpError,
  type SlackClientFactory,
  type SlackResponse,
} from './slack-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<SlackClientFactory, 'call' | 'baseUrl' | 'buildAuthHeader'>> => ({
  call,
  baseUrl: jest.fn(),
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
    getConnection: jest.fn().mockResolvedValue(makeConnection()),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return ctx as unknown as ExecutionContext & { markConnectionForRefresh: jest.Mock };
};

function makeConnection(): DecryptedConnection<SlackOAuth2Config> {
  return {
    id: VALID_CONNECTION_ID,
    type: 'OAUTH2',
    provider: 'slack',
    config: { accessToken: 'xoxb-valid', teamId: 'T123', botUserId: 'U123', scope: 'users:read' },
    refreshToken: undefined,
  };
}

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, mode: 'email', query: 'a@b.com', ...overrides },
});

describe('SlackFindUserAction', () => {
  let call: jest.Mock;
  let action: SlackFindUserAction;

  beforeEach(() => {
    call = jest.fn();
    action = new SlackFindUserAction(makeClient(call) as unknown as SlackClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('slack-find-user');
    expect(action.requiredConnectionType).toBe('slack');
    expect(action.category).toBe('action');
  });

  describe('mode=email', () => {
    it('GETs users.lookupByEmail and maps the user', async () => {
      call.mockResolvedValue({
        status: 200,
        data: {
          ok: true,
          user: { id: 'U1', name: 'jo', real_name: 'Jo', profile: { email: 'a@b.com' } },
        },
      } as SlackResponse);

      const result = await action.execute(makeInput(), makeContext());

      const [, path, init] = call.mock.calls[0];
      expect(path).toBe('/users.lookupByEmail?email=a%40b.com');
      expect(init.method).toBe('GET');
      expect(result.data).toEqual({
        found: true,
        user: { id: 'U1', name: 'jo', realName: 'Jo', email: 'a@b.com' },
      });
    });

    it('returns found:false when Slack reports users_not_found', async () => {
      call.mockRejectedValue(new SlackHttpError(400, { ok: false, error: 'users_not_found' }));
      const result = await action.execute(makeInput(), makeContext());
      expect(result.data).toEqual({ found: false, user: null });
    });
  });

  describe('mode=name', () => {
    it('pages users.list and matches by name (case-insensitive)', async () => {
      call
        .mockResolvedValueOnce({
          status: 200,
          data: {
            ok: true,
            members: [{ id: 'U9', name: 'zoe', real_name: 'Zoe' }],
            response_metadata: { next_cursor: 'next' },
          },
        } as SlackResponse)
        .mockResolvedValueOnce({
          status: 200,
          data: { ok: true, members: [{ id: 'U1', name: 'jim', real_name: 'Jim Halpert' }] },
        } as SlackResponse);

      const result = await action.execute(
        makeInput({ mode: 'name', query: 'halpert' }),
        makeContext(),
      );

      expect(call).toHaveBeenCalledTimes(2);
      expect(call.mock.calls[1][1]).toContain('cursor=next');
      expect((result.data.user as { id: string }).id).toBe('U1');
      expect(result.data.found).toBe(true);
    });
  });

  describe('auth and schema', () => {
    it('surfaces SlackHttpError(401) verbatim without marking for refresh', async () => {
      call.mockRejectedValue(new SlackHttpError(401, { ok: false, error: 'invalid_auth' }));
      const ctx = makeContext();
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(SlackHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('rejects an invalid mode before any call', async () => {
      const ctx = makeContext();
      await expect(action.execute(makeInput({ mode: 'phone' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  it('skips the API on dry-run with mockOnDryRun', async () => {
    const result = await action.execute(
      makeInput({ mockOnDryRun: true }),
      makeContext({ isDryRun: true }),
    );
    expect(call).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
