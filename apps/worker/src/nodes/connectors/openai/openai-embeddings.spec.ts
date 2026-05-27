import {
  ConnectionAuthError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
} from '@tietide/sdk';
import type { OpenAIApiKeyConfig } from '@tietide/shared';
import { OpenaiEmbeddingsAction } from './openai-embeddings';
import { OpenaiClientFactory } from './openai-client.factory';

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
  params: { connectionId: VALID_CONNECTION_ID, input: 'embed me', ...overrides },
});

describe('OpenaiEmbeddingsAction', () => {
  let createEmbeddings: jest.Mock;
  let action: OpenaiEmbeddingsAction;

  beforeEach(() => {
    createEmbeddings = jest.fn();
    const factory = { createEmbeddings, buildClient: jest.fn() };
    action = new OpenaiEmbeddingsAction(factory as unknown as OpenaiClientFactory);
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('openai-embeddings');
    expect(action.requiredConnectionType).toBe('openai');
  });

  describe('happy path', () => {
    it('returns the embedding vector and dimensions', async () => {
      createEmbeddings.mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
        dimensions: 3,
        inputTokens: 4,
        model: 'text-embedding-3-small',
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, request] = createEmbeddings.mock.calls[0];
      expect(request.model).toBe('text-embedding-3-small');
      expect(request.input).toBe('embed me');
      expect(result.data.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.data.dimensions).toBe(3);
    });
  });

  describe('schema rejection', () => {
    it('rejects empty input before contacting OpenAI', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ input: '' }), ctx)).rejects.toThrow();
      expect(createEmbeddings).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns mocked output and skips API call on dry-run', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(createEmbeddings).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });

  describe('auth and error handling', () => {
    it('surfaces 401 verbatim when API_KEY connection has no refreshToken', async () => {
      const err = Object.assign(new Error('auth failed'), { status: 401 });
      createEmbeddings.mockRejectedValue(err);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBe(err);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });

    it('would refresh + wrap in ConnectionAuthError if a refreshToken were present', async () => {
      const err = Object.assign(new Error('auth failed'), { status: 401 });
      createEmbeddings.mockRejectedValue(err);
      const ctx = makeContext({
        getConnection: jest.fn().mockResolvedValue(makeConnection({ refreshToken: 'rt' })),
      });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });
  });
});
