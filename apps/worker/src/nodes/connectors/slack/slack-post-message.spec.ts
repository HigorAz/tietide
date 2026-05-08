import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { SlackOAuth2Config } from '@tietide/shared';
import { SlackPostMessageAction } from './slack-post-message';
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
    getConnection: jest.fn(),
    markConnectionForRefresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return ctx as unknown as ExecutionContext & { markConnectionForRefresh: jest.Mock };
};

const makeConnection = (): DecryptedConnection<SlackOAuth2Config> => ({
  id: VALID_CONNECTION_ID,
  type: 'OAUTH2',
  provider: 'slack',
  config: {
    accessToken: 'xoxb-valid',
    teamId: 'T123',
    botUserId: 'U123',
    scope: 'chat:write',
  },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    channel: 'C0123ABCDEF',
    text: 'hello world',
    ...overrides,
  },
});

describe('SlackPostMessageAction', () => {
  let call: jest.Mock;
  let client: jest.Mocked<Pick<SlackClientFactory, 'call' | 'baseUrl' | 'buildAuthHeader'>>;
  let action: SlackPostMessageAction;

  beforeEach(() => {
    call = jest.fn();
    client = makeClient(call);
    action = new SlackPostMessageAction(client as unknown as SlackClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('slack-post-message');
    expect(action.requiredConnectionType).toBe('slack');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('POSTs to /chat.postMessage and returns ts/channel/ok', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { ok: true, channel: 'C0123ABCDEF', ts: '1717000000.000100' },
      } as SlackResponse);

      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput(), ctx);

      expect(call).toHaveBeenCalledTimes(1);
      const [conn, path, init] = call.mock.calls[0];
      expect(conn.id).toBe(VALID_CONNECTION_ID);
      expect(path).toBe('/chat.postMessage');
      expect(init.method).toBe('POST');
      const payload = JSON.parse(init.body as string);
      expect(payload).toEqual({ channel: 'C0123ABCDEF', text: 'hello world' });

      expect(result.data).toEqual({
        ok: true,
        channel: 'C0123ABCDEF',
        ts: '1717000000.000100',
      });
    });

    it('passes blocks[] and threadTs through verbatim', async () => {
      call.mockResolvedValue({ status: 200, data: { ok: true } } as SlackResponse);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'hi' } }];
      await action.execute(makeInput({ blocks, threadTs: '1717000000.000100' }), ctx);
      const [, , init] = call.mock.calls[0];
      const payload = JSON.parse(init.body as string);
      expect(payload.blocks).toEqual(blocks);
      expect(payload.thread_ts).toBe('1717000000.000100');
    });
  });

  describe('auth and error handling', () => {
    // Slack OAuth tokens do not expire by default — slackOAuth2ConfigSchema has no
    // refreshToken — so BaseConnectorAction's refresh path is intentionally NOT
    // taken. The underlying SlackHttpError bubbles to the user, who must re-install
    // the app. SlackHttpError preserves response.status=401 so callers can detect.
    it('surfaces SlackHttpError(401) verbatim when invalid_auth and no refresh available', async () => {
      const err = new SlackHttpError(401, { ok: false, error: 'invalid_auth' });
      call.mockRejectedValue(err);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(SlackHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('would mark for refresh and wrap in ConnectionAuthError if connection had refreshToken', async () => {
      call.mockRejectedValue(new SlackHttpError(401, { ok: false, error: 'token_revoked' }));
      const refreshable: DecryptedConnection<SlackOAuth2Config> = {
        ...makeConnection(),
        refreshToken: 'rt-present',
      };
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(refreshable) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth Slack errors verbatim', async () => {
      call.mockRejectedValue(new SlackHttpError(400, { ok: false, error: 'channel_not_found' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(SlackHttpError);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects malformed channel ID before hitting Slack', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ channel: 'not-a-channel' }), ctx)).rejects.toThrow();
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and skips API on dry-run', async () => {
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
