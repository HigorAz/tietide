import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { DiscordBotConfig } from '@tietide/shared';
import { DiscordAddRoleAction } from './discord-add-role';
import { DiscordBotHttpError, type DiscordBotClientFactory } from './discord-bot-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeClient = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<DiscordBotClientFactory, 'call' | 'baseUrl'>> => ({
  call,
  baseUrl: jest.fn(),
});

function makeConnection(): DecryptedConnection<DiscordBotConfig> {
  return {
    id: VALID_CONNECTION_ID,
    type: 'API_KEY',
    provider: 'discord-bot',
    config: { applicationId: '123', publicKey: 'abcdef', botToken: 'bot-token' },
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
    guildId: '111',
    userId: '222',
    roleId: '333',
    ...overrides,
  },
});

describe('DiscordAddRoleAction', () => {
  let call: jest.Mock;
  let action: DiscordAddRoleAction;

  beforeEach(() => {
    call = jest.fn();
    action = new DiscordAddRoleAction(makeClient(call) as unknown as DiscordBotClientFactory);
  });

  it('declares correct type and required connection type', () => {
    expect(action.type).toBe('discord-add-role');
    expect(action.requiredConnectionType).toBe('discord-bot');
  });

  it('PUTs the member role endpoint and returns ok', async () => {
    call.mockResolvedValue({ status: 204, data: null });

    const result = await action.execute(makeInput(), makeContext());

    const [token, method, path, payload] = call.mock.calls[0];
    expect(token).toBe('bot-token');
    expect(method).toBe('PUT');
    expect(path).toBe('/guilds/111/members/222/roles/333');
    expect(payload).toBeUndefined();
    expect(result.data).toEqual({ ok: true, userId: '222', roleId: '333' });
  });

  it('surfaces DiscordBotHttpError(403) verbatim without marking for refresh', async () => {
    call.mockRejectedValue(new DiscordBotHttpError(403, { message: 'Missing Permissions' }));
    const ctx = makeContext();
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(DiscordBotHttpError);
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric roleId before any call', async () => {
    const ctx = makeContext();
    await expect(action.execute(makeInput({ roleId: 'admin' }), ctx)).rejects.toThrow();
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
