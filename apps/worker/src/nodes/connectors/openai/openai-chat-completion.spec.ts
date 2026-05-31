import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import { aiNodeOutputSchema, type OpenAIApiKeyConfig } from '@tietide/shared';
import { OpenaiChatCompletionAction } from './openai-chat-completion';
import {
  OpenaiClientFactory,
  type OpenaiChatRequest,
  type OpenaiChatResponse,
} from './openai-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '22222222-2222-4222-8222-222222222222';

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
  overrides: Partial<DecryptedConnection<OpenAIApiKeyConfig>> = {},
): DecryptedConnection<OpenAIApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'openai',
  config: { apiKey: 'sk-openai-test' },
  refreshToken: undefined,
  ...overrides,
});

const makeInput = (overrides: Record<string, unknown> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    prompt: 'What is the capital of France?',
    ...overrides,
  },
});

describe('OpenaiChatCompletionAction', () => {
  let createChatCompletion: jest.Mock<Promise<OpenaiChatResponse>, [unknown, OpenaiChatRequest]>;
  let action: OpenaiChatCompletionAction;

  beforeEach(() => {
    createChatCompletion = jest.fn();
    const factory = { createChatCompletion, buildClient: jest.fn() };
    action = new OpenaiChatCompletionAction(factory as unknown as OpenaiClientFactory);
  });

  it('declares correct type, required connection, and outputSchema', () => {
    expect(action.type).toBe('openai-chat-completion');
    expect(action.requiredConnectionType).toBe('openai');
    expect(action.category).toBe('action');
    expect(action.outputSchema).toBe(aiNodeOutputSchema);
  });

  describe('happy path', () => {
    it('calls OpenAI chat completions and returns standardized output shape', async () => {
      createChatCompletion.mockResolvedValue({
        text: 'Paris.',
        inputTokens: 18,
        outputTokens: 2,
        model: 'gpt-4o-2024-08-06',
        finishReason: 'stop',
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(makeInput(), ctx);

      expect(createChatCompletion).toHaveBeenCalledTimes(1);
      const [, request] = createChatCompletion.mock.calls[0];
      expect(request.model).toBe('gpt-4o');
      expect(request.prompt).toBe('What is the capital of France?');
      expect(request.system).toBeUndefined();

      const parsed = aiNodeOutputSchema.parse(result.data);
      expect(parsed).toEqual({
        text: 'Paris.',
        usage: { inputTokens: 18, outputTokens: 2 },
        model: 'gpt-4o-2024-08-06',
        finishReason: 'stop',
      });
    });

    it('forwards a system prompt when provided', async () => {
      createChatCompletion.mockResolvedValue({
        text: 'ok',
        inputTokens: 0,
        outputTokens: 0,
        model: 'gpt-4o',
        finishReason: 'stop',
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ system: 'You are concise.' }), ctx);
      expect(createChatCompletion.mock.calls[0][1].system).toBe('You are concise.');
    });

    it('honors a user-supplied model and maxTokens', async () => {
      createChatCompletion.mockResolvedValue({
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        model: 'gpt-4-turbo',
        finishReason: 'stop',
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ model: 'gpt-4-turbo', maxTokens: 512 }), ctx);
      expect(createChatCompletion.mock.calls[0][1].model).toBe('gpt-4-turbo');
      expect(createChatCompletion.mock.calls[0][1].maxTokens).toBe(512);
    });
  });

  describe('schema rejection', () => {
    it('rejects empty prompt before contacting OpenAI', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ prompt: '' }), ctx)).rejects.toThrow();
      expect(createChatCompletion).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns mocked output and skips API call on dry-run', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(createChatCompletion).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.data).toMatchObject({ dryRun: true, skipped: true });
    });
  });

  describe('auth and error handling', () => {
    it('rethrows non-auth errors verbatim', async () => {
      const err = Object.assign(new Error('rate limited'), { status: 429 });
      createChatCompletion.mockRejectedValue(err);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBe(err);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('surfaces 401 verbatim when API_KEY connection has no refreshToken', async () => {
      const err = Object.assign(new Error('OpenAI auth failed'), { status: 401 });
      createChatCompletion.mockRejectedValue(err);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBe(err);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('would refresh and wrap in ConnectionAuthError if a refreshToken were present', async () => {
      const err = Object.assign(new Error('OpenAI auth failed'), { status: 401 });
      createChatCompletion.mockRejectedValue(err);
      const refreshable = makeConnection({ refreshToken: 'rt-present' });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(refreshable) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });
  });
});
