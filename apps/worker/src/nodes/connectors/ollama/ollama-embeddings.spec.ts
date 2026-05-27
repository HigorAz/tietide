import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { OllamaConfig } from '@tietide/shared';
import { OllamaEmbeddingsAction } from './ollama-embeddings';
import { OllamaClientFactory } from './ollama-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '44444444-4444-4444-8444-444444444444';

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

const makeConnection = (): DecryptedConnection<OllamaConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'CUSTOM',
  provider: 'ollama',
  config: { baseUrl: 'http://localhost:11434', model: 'nomic-embed-text' },
  refreshToken: undefined,
});

const makeInput = (overrides: Record<string, unknown> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, prompt: 'embed me', ...overrides },
});

describe('OllamaEmbeddingsAction', () => {
  let embeddings: jest.Mock;
  let action: OllamaEmbeddingsAction;

  beforeEach(() => {
    embeddings = jest.fn();
    const factory = { embeddings, baseUrl: jest.fn() };
    action = new OllamaEmbeddingsAction(factory as unknown as OllamaClientFactory);
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('ollama-embeddings');
    expect(action.requiredConnectionType).toBe('ollama');
  });

  describe('happy path', () => {
    it('falls back to the connection model and returns the vector', async () => {
      embeddings.mockResolvedValue({
        embedding: [1, 2, 3],
        dimensions: 3,
        model: 'nomic-embed-text',
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, request] = embeddings.mock.calls[0];
      expect(request.model).toBe('nomic-embed-text');
      expect(request.prompt).toBe('embed me');
      expect(result.data.embedding).toEqual([1, 2, 3]);
      expect(result.data.dimensions).toBe(3);
    });

    it('honors a node-level model override', async () => {
      embeddings.mockResolvedValue({ embedding: [0], dimensions: 1, model: 'mxbai-embed-large' });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ model: 'mxbai-embed-large' }), ctx);
      expect(embeddings.mock.calls[0][1].model).toBe('mxbai-embed-large');
    });
  });

  describe('schema rejection', () => {
    it('rejects an empty prompt', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ prompt: '' }), ctx)).rejects.toThrow();
      expect(embeddings).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns mocked output and skips the call on dry-run', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(embeddings).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });
});
