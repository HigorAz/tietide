import {
  ConnectorMisconfiguredError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { SlackOAuth2Config } from '@tietide/shared';
import { SlackPostToChannelAction } from './slack-post-to-channel';
import type { SlackClientFactory, SlackResponse } from './slack-client.factory';

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
    scope: 'chat:write,channels:read',
  },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    channelName: 'general',
    text: 'hello',
    ...overrides,
  },
});

describe('SlackPostToChannelAction', () => {
  let call: jest.Mock;
  let action: SlackPostToChannelAction;

  beforeEach(() => {
    call = jest.fn();
    action = new SlackPostToChannelAction(makeClient(call) as unknown as SlackClientFactory);
  });

  it('looks up channel by name then posts', async () => {
    call
      .mockResolvedValueOnce({
        status: 200,
        data: {
          ok: true,
          channels: [
            { id: 'C111', name: 'random' },
            { id: 'C222', name: 'general' },
          ],
        },
      } as SlackResponse)
      .mockResolvedValueOnce({
        status: 200,
        data: { ok: true, channel: 'C222', ts: '1717.0001' },
      } as SlackResponse);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput(), ctx);

    expect(call).toHaveBeenCalledTimes(2);
    const [, postPath, postInit] = call.mock.calls[1];
    expect(postPath).toBe('/chat.postMessage');
    const payload = JSON.parse(postInit.body as string);
    expect(payload.channel).toBe('C222');
    expect(result.data.channelName).toBe('general');
  });

  it('paginates through cursor when channel is on second page', async () => {
    call
      .mockResolvedValueOnce({
        status: 200,
        data: {
          ok: true,
          channels: [{ id: 'C111', name: 'random' }],
          response_metadata: { next_cursor: 'cur-1' },
        },
      } as SlackResponse)
      .mockResolvedValueOnce({
        status: 200,
        data: {
          ok: true,
          channels: [{ id: 'C222', name: 'general' }],
        },
      } as SlackResponse)
      .mockResolvedValueOnce({
        status: 200,
        data: { ok: true, channel: 'C222', ts: '1717.0001' },
      } as SlackResponse);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await action.execute(makeInput(), ctx);

    expect(call).toHaveBeenCalledTimes(3);
    expect(call.mock.calls[1][1] as string).toContain('cursor=cur-1');
  });

  it('throws ConnectorMisconfiguredError when channel not found', async () => {
    call.mockResolvedValue({
      status: 200,
      data: { ok: true, channels: [{ id: 'C111', name: 'other' }] },
    } as SlackResponse);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(
      ConnectorMisconfiguredError,
    );
  });

  it('rejects malformed channel name in schema', async () => {
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput({ channelName: 'Has Spaces' }), ctx)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});
