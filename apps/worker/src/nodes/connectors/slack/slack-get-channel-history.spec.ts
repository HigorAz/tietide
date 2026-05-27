import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { SlackOAuth2Config } from '@tietide/shared';
import { SlackGetChannelHistoryAction } from './slack-get-channel-history';
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
    config: { accessToken: 'xoxb-valid', teamId: 'T1', botUserId: 'U1', scope: 'channels:history' },
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
  params: { connectionId: VALID_CONNECTION_ID, channel: 'C0123ABCDEF', ...overrides },
});

describe('SlackGetChannelHistoryAction', () => {
  let call: jest.Mock;
  let action: SlackGetChannelHistoryAction;

  beforeEach(() => {
    call = jest.fn();
    action = new SlackGetChannelHistoryAction(makeClient(call) as unknown as SlackClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('slack-get-channel-history');
    expect(action.requiredConnectionType).toBe('slack');
  });

  it('GETs conversations.history and maps messages + pagination', async () => {
    call.mockResolvedValue({
      status: 200,
      data: {
        ok: true,
        messages: [{ user: 'U1', text: 'hi', ts: '1717000000.0001', thread_ts: '1717000000.0001' }],
        has_more: true,
        response_metadata: { next_cursor: 'c2' },
      },
    } as SlackResponse);

    const result = await action.execute(makeInput({ limit: 50 }), makeContext());

    const [, path, init] = call.mock.calls[0];
    expect(path).toContain('/conversations.history?');
    expect(path).toContain('channel=C0123ABCDEF');
    expect(path).toContain('limit=50');
    expect(init.method).toBe('GET');
    expect(result.data.count).toBe(1);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.nextCursor).toBe('c2');
    expect((result.data.messages as unknown[])[0]).toEqual({
      user: 'U1',
      text: 'hi',
      ts: '1717000000.0001',
      threadTs: '1717000000.0001',
    });
  });

  it('surfaces SlackHttpError(401) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new SlackHttpError(401, { ok: false, error: 'invalid_auth' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(SlackHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects a limit above 200 before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ limit: 500 }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});
