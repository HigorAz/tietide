import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import { aiNodeOutputSchema, type AnthropicApiKeyConfig } from '@tietide/shared';
import { ClaudeMessagesAction } from './claude-messages';
import {
  ClaudeClientFactory,
  type ClaudeMessageRequest,
  type ClaudeMessageResponse,
} from './claude-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

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
  overrides: Partial<DecryptedConnection<AnthropicApiKeyConfig>> = {},
): DecryptedConnection<AnthropicApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'anthropic',
  config: { apiKey: 'sk-ant-test' },
  refreshToken: undefined,
  ...overrides,
});

const makeInput = (overrides: Record<string, unknown> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    prompt: 'Summarize: hello world',
    ...overrides,
  },
});

describe('ClaudeMessagesAction', () => {
  let createMessage: jest.Mock<Promise<ClaudeMessageResponse>, [unknown, ClaudeMessageRequest]>;
  let action: ClaudeMessagesAction;

  beforeEach(() => {
    createMessage = jest.fn();
    const factory = { createMessage, buildClient: jest.fn() };
    action = new ClaudeMessagesAction(factory as unknown as ClaudeClientFactory);
  });

  it('declares correct type, required connection, and outputSchema', () => {
    expect(action.type).toBe('claude-messages');
    expect(action.requiredConnectionType).toBe('anthropic');
    expect(action.category).toBe('action');
    expect(action.outputSchema).toBe(aiNodeOutputSchema);
  });

  describe('happy path', () => {
    it('calls Anthropic with model+prompt and returns standardized output shape', async () => {
      createMessage.mockResolvedValue({
        text: 'A short summary.',
        inputTokens: 12,
        outputTokens: 7,
        model: 'claude-sonnet-4-6',
        stopReason: 'end_turn',
      });
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });

      const result = await action.execute(makeInput(), ctx);

      expect(createMessage).toHaveBeenCalledTimes(1);
      const [, request] = createMessage.mock.calls[0];
      expect(request.model).toBe('claude-sonnet-4-6');
      expect(request.prompt).toBe('Summarize: hello world');
      expect(request.maxTokens).toBe(1024);
      expect(request.enablePromptCaching).toBe(false);
      expect(request.system).toBeUndefined();

      // Output schema validates the shape
      const parsed = aiNodeOutputSchema.parse(result.data);
      expect(parsed).toEqual({
        text: 'A short summary.',
        usage: { inputTokens: 12, outputTokens: 7 },
        model: 'claude-sonnet-4-6',
        finishReason: 'end_turn',
      });
    });

    it('honors a user-supplied model override', async () => {
      createMessage.mockResolvedValue({
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        model: 'claude-opus-4-7',
        stopReason: null,
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ model: 'claude-opus-4-7' }), ctx);
      expect(createMessage.mock.calls[0][1].model).toBe('claude-opus-4-7');
    });
  });

  describe('prompt caching flag', () => {
    it('passes enablePromptCaching=true through to the factory', async () => {
      createMessage.mockResolvedValue({
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        model: 'claude-sonnet-4-6',
        stopReason: null,
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(
        makeInput({
          system: 'You are a helpful summarizer.',
          enablePromptCaching: true,
        }),
        ctx,
      );
      const [, request] = createMessage.mock.calls[0];
      expect(request.enablePromptCaching).toBe(true);
      expect(request.system).toBe('You are a helpful summarizer.');
    });

    it('defaults enablePromptCaching=false when omitted', async () => {
      createMessage.mockResolvedValue({
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        model: 'claude-sonnet-4-6',
        stopReason: null,
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ system: 'sys' }), ctx);
      expect(createMessage.mock.calls[0][1].enablePromptCaching).toBe(false);
    });
  });

  describe('schema rejection', () => {
    it('rejects empty prompt before contacting Anthropic', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ prompt: '' }), ctx)).rejects.toThrow();
      expect(createMessage).not.toHaveBeenCalled();
    });

    it('rejects unsupported maxTokens above the schema cap', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ maxTokens: 999999 }), ctx)).rejects.toThrow();
      expect(createMessage).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns standardized mocked output and skips API call on dry-run', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(createMessage).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.data.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    });
  });

  describe('auth and error handling', () => {
    it('rethrows non-auth errors verbatim', async () => {
      const err = Object.assign(new Error('rate limited'), { status: 429 });
      createMessage.mockRejectedValue(err);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBe(err);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('surfaces 401 verbatim when API_KEY connection has no refreshToken', async () => {
      const err = Object.assign(new Error('Anthropic auth failed'), { status: 401 });
      createMessage.mockRejectedValue(err);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBe(err);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('would refresh and wrap in ConnectionAuthError if a refreshToken were present', async () => {
      const err = Object.assign(new Error('Anthropic auth failed'), { status: 401 });
      createMessage.mockRejectedValue(err);
      const refreshable = makeConnection({ refreshToken: 'rt-present' });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(refreshable) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });
  });
});
