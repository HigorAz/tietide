import { type ExecutionContext, type NodeInput } from '@tietide/sdk';
import { DiscordHttpError } from './discord-post-webhook';
import { DiscordReplyToCommandAction } from './discord-reply-to-command';

jest.setTimeout(15000);

const APP_ID = '1508674008793481226';
const TOKEN = 'interaction-token-abc';

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext =>
  ({
    executionId: 'exec-1',
    workflowId: 'wf-1',
    nodeId: 'node-1',
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSecret: jest.fn(),
    getConnection: jest.fn(),
    markConnectionForRefresh: jest.fn(),
    ...overrides,
  }) as unknown as ExecutionContext;

const makeInput = (
  overrides: { data?: Record<string, unknown>; params?: Record<string, unknown> } = {},
): NodeInput => ({
  data: { type: 2, token: TOKEN, application_id: APP_ID, ...(overrides.data ?? {}) },
  params: { content: 'Hello!', ...(overrides.params ?? {}) },
});

describe('DiscordReplyToCommandAction', () => {
  it('PATCHes the original interaction response with the content (token from trigger output)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ id: 'm1' }),
    });
    const action = new DiscordReplyToCommandAction(fetchImpl as unknown as typeof fetch);

    const result = await action.execute(makeInput(), makeContext());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://discord.com/api/v10/webhooks/${APP_ID}/${TOKEN}/messages/@original`);
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ content: 'Hello!' });
    expect(result.data).toEqual({ ok: true, messageId: 'm1' });
  });

  it('prefers explicit params.interactionToken/applicationId over the trigger output', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200, json: () => Promise.resolve({}) });
    const action = new DiscordReplyToCommandAction(fetchImpl as unknown as typeof fetch);

    await action.execute(
      makeInput({ params: { content: 'x', interactionToken: 'OVERRIDE', applicationId: '999' } }),
      makeContext(),
    );

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/webhooks/999/OVERRIDE/messages/@original');
  });

  it('throws a clear error when the interaction token / application id are missing', async () => {
    const fetchImpl = jest.fn();
    const action = new DiscordReplyToCommandAction(fetchImpl as unknown as typeof fetch);

    await expect(
      action.execute({ data: {}, params: { content: 'x' } }, makeContext()),
    ).rejects.toThrow(/interaction token/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws DiscordHttpError on a non-2xx response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 404,
      json: () => Promise.resolve({ message: 'Unknown Webhook' }),
    });
    const action = new DiscordReplyToCommandAction(fetchImpl as unknown as typeof fetch);

    await expect(action.execute(makeInput(), makeContext())).rejects.toBeInstanceOf(
      DiscordHttpError,
    );
  });

  it('returns mocked output on dry-run', async () => {
    const fetchImpl = jest.fn();
    const action = new DiscordReplyToCommandAction(fetchImpl as unknown as typeof fetch);

    const result = await action.execute(
      makeInput({ params: { content: 'x', mockOnDryRun: true } }),
      makeContext({ isDryRun: true }),
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
