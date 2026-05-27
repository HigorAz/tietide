import { type DecryptedConnection, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import type { OpenAIApiKeyConfig } from '@tietide/shared';
import { OpenaiGenerateImageAction } from './openai-generate-image';
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

const makeConnection = (): DecryptedConnection<OpenAIApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'openai',
  config: { apiKey: 'sk-openai-test' },
  refreshToken: undefined,
});

const makeInput = (overrides: Record<string, unknown> = {}): NodeInput => ({
  data: {},
  connectionId: VALID_CONNECTION_ID,
  params: { connectionId: VALID_CONNECTION_ID, prompt: 'a red bicycle', ...overrides },
});

describe('OpenaiGenerateImageAction', () => {
  let createImage: jest.Mock;
  let action: OpenaiGenerateImageAction;

  beforeEach(() => {
    createImage = jest.fn();
    const factory = { createImage, buildClient: jest.fn() };
    action = new OpenaiGenerateImageAction(factory as unknown as OpenaiClientFactory);
  });

  it('declares correct type and connection type', () => {
    expect(action.type).toBe('openai-generate-image');
    expect(action.requiredConnectionType).toBe('openai');
  });

  describe('happy path', () => {
    it('generates an image with default model and size', async () => {
      createImage.mockResolvedValue({
        images: [{ url: 'https://img/1.png', b64Json: null }],
        model: 'dall-e-3',
      });
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(), ctx);

      const [, request] = createImage.mock.calls[0];
      expect(request.model).toBe('dall-e-3');
      expect(request.size).toBe('1024x1024');
      expect(request.count).toBe(1);
      expect(result.data.count).toBe(1);
      expect((result.data.images as Array<{ url: string }>)[0].url).toBe('https://img/1.png');
    });
  });

  describe('schema rejection', () => {
    it('rejects an invalid size', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ size: '999x999' }), ctx)).rejects.toThrow();
      expect(createImage).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns mocked output and skips API call on dry-run', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(createImage).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
    });
  });

  describe('auth and error handling', () => {
    it('surfaces 401 verbatim when API_KEY connection has no refreshToken', async () => {
      const err = Object.assign(new Error('auth failed'), { status: 401 });
      createImage.mockRejectedValue(err);
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBe(err);
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });
});
