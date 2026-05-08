import {
  ConnectorMisconfiguredError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import { discordWebhookConfigSchema, type DiscordWebhookConfig } from '@tietide/shared';
import { DiscordHttpError, DiscordPostWebhookAction } from './discord-post-webhook';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const VALID_WEBHOOK = 'https://discord.com/api/webhooks/1234567890/abcDEF-token_value';

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
  overrides: Partial<DiscordWebhookConfig> = {},
): DecryptedConnection<DiscordWebhookConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'CUSTOM',
  provider: 'discord',
  config: { webhookUrl: VALID_WEBHOOK, ...overrides },
  refreshToken: undefined,
});

const makeInput = (overrides: Partial<NodeInput['params']> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    content: 'hello discord',
    ...overrides,
  },
});

describe('DiscordPostWebhookAction', () => {
  it('POSTs JSON payload to webhookUrl?wait=true and returns the message id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ id: '999111' }),
    });
    const action = new DiscordPostWebhookAction(fetchImpl as unknown as typeof fetch);

    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    const result = await action.execute(makeInput(), ctx);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${VALID_WEBHOOK}?wait=true`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ content: 'hello discord' });

    expect(result.data).toEqual({ ok: true, messageId: '999111' });
  });

  it('passes username, avatar_url, and embeds when provided', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ id: '1' }),
    });
    const action = new DiscordPostWebhookAction(fetchImpl as unknown as typeof fetch);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await action.execute(
      makeInput({
        username: 'tietide',
        avatarUrl: 'https://example.com/a.png',
        embeds: [{ title: 'note' }],
      }),
      ctx,
    );
    const [, init] = fetchImpl.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(payload).toEqual({
      content: 'hello discord',
      username: 'tietide',
      avatar_url: 'https://example.com/a.png',
      embeds: [{ title: 'note' }],
    });
  });

  it('throws DiscordHttpError on non-2xx', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 401,
      json: () => Promise.resolve({ message: 'unauthorized' }),
    });
    const action = new DiscordPostWebhookAction(fetchImpl as unknown as typeof fetch);
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(DiscordHttpError);
  });

  it('throws ConnectorMisconfiguredError when webhookUrl is mutated to a non-Discord URL', async () => {
    const fetchImpl = jest.fn();
    const action = new DiscordPostWebhookAction(fetchImpl as unknown as typeof fetch);
    const badConnection = makeConnection({
      webhookUrl: 'https://evil.example.com/api/webhooks/1/x',
    });
    const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(badConnection) });
    await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(
      ConnectorMisconfiguredError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns mocked output on dry-run', async () => {
    const fetchImpl = jest.fn();
    const action = new DiscordPostWebhookAction(fetchImpl as unknown as typeof fetch);
    const ctx = makeContext({
      isDryRun: true,
      getConnection: jest.fn().mockResolvedValue(makeConnection()),
    });
    const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });

  it('rejects non-Discord URLs at the schema layer (Connection.create)', () => {
    const result = discordWebhookConfigSchema.safeParse({ webhookUrl: 'https://example.com/foo' });
    expect(result.success).toBe(false);
  });
});
