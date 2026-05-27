import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { SlackOAuth2Config } from '@tietide/shared';
import { SlackInviteToChannelAction } from './slack-invite-to-channel';
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

function makeConnection(): DecryptedConnection<SlackOAuth2Config> {
  return {
    id: VALID_CONNECTION_ID,
    type: 'OAUTH2',
    provider: 'slack',
    config: { accessToken: 'xoxb-valid', teamId: 'T1', botUserId: 'U1', scope: 'channels:manage' },
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
  params: {
    connectionId: VALID_CONNECTION_ID,
    channel: 'C0123ABCDEF',
    users: ['U0111111', 'U0222222'],
    ...overrides,
  },
});

describe('SlackInviteToChannelAction', () => {
  let call: jest.Mock;
  let action: SlackInviteToChannelAction;

  beforeEach(() => {
    call = jest.fn();
    action = new SlackInviteToChannelAction(makeClient(call) as unknown as SlackClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('slack-invite-to-channel');
    expect(action.requiredConnectionType).toBe('slack');
  });

  it('POSTs conversations.invite with comma-joined user IDs', async () => {
    call.mockResolvedValue({
      status: 200,
      data: { ok: true, channel: { id: 'C0123ABCDEF' } },
    } as SlackResponse);

    const result = await action.execute(makeInput(), makeContext());

    const [, path, init] = call.mock.calls[0];
    expect(path).toBe('/conversations.invite');
    expect(JSON.parse(init.body as string)).toEqual({
      channel: 'C0123ABCDEF',
      users: 'U0111111,U0222222',
    });
    expect(result.data).toEqual({
      ok: true,
      channelId: 'C0123ABCDEF',
      invited: ['U0111111', 'U0222222'],
    });
  });

  it('surfaces SlackHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new SlackHttpError(401, { ok: false, error: 'invalid_auth' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(SlackHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects an empty users array before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ users: [] }), ctx)).rejects.toThrow();
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
