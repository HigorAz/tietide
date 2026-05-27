import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { SlackOAuth2Config } from '@tietide/shared';
import { SlackCreateChannelAction } from './slack-create-channel';
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
  params: { connectionId: VALID_CONNECTION_ID, name: 'project-x', ...overrides },
});

describe('SlackCreateChannelAction', () => {
  let call: jest.Mock;
  let action: SlackCreateChannelAction;

  beforeEach(() => {
    call = jest.fn();
    action = new SlackCreateChannelAction(makeClient(call) as unknown as SlackClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('slack-create-channel');
    expect(action.requiredConnectionType).toBe('slack');
  });

  it('POSTs conversations.create and returns the new channel id', async () => {
    call.mockResolvedValue({
      status: 200,
      data: { ok: true, channel: { id: 'C999', name: 'project-x', is_private: true } },
    } as SlackResponse);

    const result = await action.execute(makeInput({ isPrivate: true }), makeContext());

    const [, path, init] = call.mock.calls[0];
    expect(path).toBe('/conversations.create');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'project-x', is_private: true });
    expect(result.data).toEqual({
      ok: true,
      channelId: 'C999',
      name: 'project-x',
      isPrivate: true,
    });
  });

  it('surfaces SlackHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new SlackHttpError(401, { ok: false, error: 'invalid_auth' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(SlackHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects an invalid channel name before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ name: 'Project X!' }), ctx)).rejects.toThrow();
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
