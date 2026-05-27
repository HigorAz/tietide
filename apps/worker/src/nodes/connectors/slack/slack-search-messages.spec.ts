import {
  ConnectorMisconfiguredError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { SlackOAuth2Config } from '@tietide/shared';
import { SlackSearchMessagesAction } from './slack-search-messages';
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

function makeConnection(withUserToken = true): DecryptedConnection<SlackOAuth2Config> {
  return {
    id: VALID_CONNECTION_ID,
    type: 'OAUTH2',
    provider: 'slack',
    config: {
      accessToken: 'xoxb-valid',
      teamId: 'T123',
      botUserId: 'U123',
      scope: 'search:read',
      ...(withUserToken ? { userAccessToken: 'xoxp-user', userScope: 'search:read' } : {}),
    },
    refreshToken: undefined,
  };
}

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

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, query: 'budget in:#finance', ...overrides },
});

describe('SlackSearchMessagesAction', () => {
  let call: jest.Mock;
  let action: SlackSearchMessagesAction;

  beforeEach(() => {
    call = jest.fn();
    action = new SlackSearchMessagesAction(makeClient(call) as unknown as SlackClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('slack-search-messages');
    expect(action.requiredConnectionType).toBe('slack');
  });

  it('GETs search.messages with the user token and maps matches', async () => {
    call.mockResolvedValue({
      status: 200,
      data: {
        ok: true,
        messages: {
          total: 1,
          matches: [
            {
              ts: '1717000000.0001',
              text: 'Q3 budget',
              user: 'U1',
              channel: { id: 'C1', name: 'finance' },
              permalink: 'https://x',
            },
          ],
        },
      },
    } as SlackResponse);

    const result = await action.execute(makeInput({ count: 10, sort: 'timestamp' }), makeContext());

    const [, path, init] = call.mock.calls[0];
    expect(path).toContain('/search.messages?');
    expect(path).toContain('query=budget+in%3A%23finance');
    expect(path).toContain('count=10');
    expect(path).toContain('sort=timestamp');
    expect(init.method).toBe('GET');
    expect(init.useUserToken).toBe(true);
    expect(result.data.total).toBe(1);
    expect((result.data.matches as unknown[])[0]).toEqual({
      ts: '1717000000.0001',
      text: 'Q3 budget',
      user: 'U1',
      username: null,
      channelId: 'C1',
      channelName: 'finance',
      permalink: 'https://x',
    });
  });

  it('throws ConnectorMisconfiguredError when the connection has no user token', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection(false)) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(
      ConnectorMisconfiguredError,
    );
    expect(call).not.toHaveBeenCalled();
  });

  it('surfaces SlackHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new SlackHttpError(401, { ok: false, error: 'invalid_auth' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(SlackHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects an empty query before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ query: '' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
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
