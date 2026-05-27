import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import { aiNodeOutputSchema, type AnthropicApiKeyConfig } from '@tietide/shared';
import { AnthropicVisionAction } from './anthropic-vision';
import { ClaudeClientFactory } from './claude-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

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

const makeConnection = (): DecryptedConnection<AnthropicApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'anthropic',
  config: { apiKey: 'sk-ant-test' },
  refreshToken: undefined,
});

const makeInput = (overrides: Record<string, unknown> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    prompt: 'Describe this image',
    imageUrl: 'https://example.com/cat.png',
    ...overrides,
  },
});

describe('AnthropicVisionAction', () => {
  let createVisionMessage: jest.Mock;
  let action: AnthropicVisionAction;

  beforeEach(() => {
    createVisionMessage = jest.fn();
    const factory = { createVisionMessage, buildClient: jest.fn() };
    action = new AnthropicVisionAction(factory as unknown as ClaudeClientFactory);
  });

  it('declares correct type, connection, and aiNodeOutputSchema', () => {
    expect(action.type).toBe('anthropic-vision');
    expect(action.requiredConnectionType).toBe('anthropic');
    expect(action.outputSchema).toBe(aiNodeOutputSchema);
  });

  describe('happy path', () => {
    it('analyzes an image URL and returns the standardized AI shape', async () => {
      createVisionMessage.mockResolvedValue({
        text: 'A cat.',
        inputTokens: 100,
        outputTokens: 3,
        model: 'claude-sonnet-4-6',
        stopReason: 'end_turn',
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, request] = createVisionMessage.mock.calls[0];
      expect(request.imageUrl).toBe('https://example.com/cat.png');
      const parsed = aiNodeOutputSchema.parse(result.data);
      expect(parsed.text).toBe('A cat.');
      expect(parsed.usage).toEqual({ inputTokens: 100, outputTokens: 3 });
    });
  });

  describe('schema rejection', () => {
    it('rejects when both imageUrl and imageBase64 are provided', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ imageBase64: 'AAAA', mediaType: 'image/png' }), ctx),
      ).rejects.toThrow();
      expect(createVisionMessage).not.toHaveBeenCalled();
    });

    it('rejects base64 image without a mediaType', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(
          {
            data: {},
            connectionId: VALID_CONNECTION_ID,
            params: { connectionId: VALID_CONNECTION_ID, prompt: 'x', imageBase64: 'AAAA' },
          },
          ctx,
        ),
      ).rejects.toThrow();
      expect(createVisionMessage).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns mocked output and skips API call on dry-run', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(createVisionMessage).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });

  describe('auth and error handling', () => {
    it('surfaces 401 verbatim when API_KEY connection has no refreshToken', async () => {
      const err = Object.assign(new Error('auth failed'), { status: 401 });
      createVisionMessage.mockRejectedValue(err);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBe(err);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });
});
