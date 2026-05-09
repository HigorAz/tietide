import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import { aiNodeOutputSchema, type OllamaConfig } from '@tietide/shared';
import { OllamaGenerateAction } from './ollama-generate';
import {
  OllamaClientFactory,
  OllamaHttpError,
  type OllamaGenerateRequest,
  type OllamaGenerateResult,
} from './ollama-client.factory';

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

const makeConnection = (
  overrides: Partial<OllamaConfig> = {},
): DecryptedConnection<OllamaConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'ollama',
  config: {
    baseUrl: 'http://localhost:11434',
    model: 'llama3.1:8b',
    ...overrides,
  },
  refreshToken: undefined,
});

const makeInput = (overrides: Record<string, unknown> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: {
    connectionId: VALID_CONNECTION_ID,
    prompt: 'Say hello',
    ...overrides,
  },
});

describe('OllamaGenerateAction', () => {
  let generate: jest.Mock<Promise<OllamaGenerateResult>, [unknown, OllamaGenerateRequest]>;
  let action: OllamaGenerateAction;

  beforeEach(() => {
    generate = jest.fn();
    const factory = { generate, baseUrl: jest.fn() };
    action = new OllamaGenerateAction(factory as unknown as OllamaClientFactory);
  });

  it('declares correct type, required connection, and outputSchema', () => {
    expect(action.type).toBe('ollama-generate');
    expect(action.requiredConnectionType).toBe('ollama');
    expect(action.category).toBe('action');
    expect(action.outputSchema).toBe(aiNodeOutputSchema);
  });

  describe('happy path', () => {
    it('uses the connection-level default model when no override is set', async () => {
      generate.mockResolvedValue({
        text: 'Hello!',
        inputTokens: 4,
        outputTokens: 2,
        model: 'llama3.1:8b',
        finishReason: 'stop',
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });

      const result = await action.execute(makeInput(), ctx);

      expect(generate).toHaveBeenCalledTimes(1);
      const [, request] = generate.mock.calls[0];
      expect(request.model).toBe('llama3.1:8b');
      expect(request.prompt).toBe('Say hello');

      const parsed = aiNodeOutputSchema.parse(result.data);
      expect(parsed).toEqual({
        text: 'Hello!',
        usage: { inputTokens: 4, outputTokens: 2 },
        model: 'llama3.1:8b',
        finishReason: 'stop',
      });
    });

    it('honors a node-level model override', async () => {
      generate.mockResolvedValue({
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        model: 'mistral:7b',
        finishReason: 'stop',
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ model: 'mistral:7b' }), ctx);
      expect(generate.mock.calls[0][1].model).toBe('mistral:7b');
    });

    it('coerces missing finishReason to null', async () => {
      generate.mockResolvedValue({
        text: 'x',
        inputTokens: 1,
        outputTokens: 1,
        model: 'llama3.1:8b',
        finishReason: null,
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);
      expect(result.data.finishReason).toBeNull();
    });
  });

  describe('schema rejection', () => {
    it('rejects empty prompt before contacting Ollama', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ prompt: '' }), ctx)).rejects.toThrow();
      expect(generate).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns mocked output and skips API call on dry-run', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(generate).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.data.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    });
  });

  describe('error handling', () => {
    it('rethrows OllamaHttpError when the server is unreachable / 5xx', async () => {
      generate.mockRejectedValue(new OllamaHttpError(503, { error: 'Service unavailable' }));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(OllamaHttpError);
    });
  });
});
