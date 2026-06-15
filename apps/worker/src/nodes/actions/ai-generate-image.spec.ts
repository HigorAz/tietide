import { AiGenerateImageAction } from './ai-generate-image';
import type { ExecutionContext, NodeInput } from '@tietide/sdk';

const baseContext = (over: Partial<ExecutionContext> = {}): ExecutionContext =>
  ({
    isDryRun: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getConnection: jest.fn(),
    ...over,
  }) as unknown as ExecutionContext;

// Stub lookup so the SSRF guard resolves the HF host to a public IP without real DNS.
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

describe('AiGenerateImageAction', () => {
  describe('pollinations provider', () => {
    it('builds a deterministic public image URL without any network call', async () => {
      const fetchImpl = jest.fn();
      const action = new AiGenerateImageAction(fetchImpl, publicLookup);
      const input: NodeInput = {
        data: {},
        params: { provider: 'pollinations', prompt: 'a red fox in snow', width: 512, height: 512 },
      };

      const out = await action.execute(input, baseContext());

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(out.data.provider).toBe('pollinations');
      expect(out.data.imageUrl).toContain('https://image.pollinations.ai/prompt/');
      expect(out.data.imageUrl).toContain(encodeURIComponent('a red fox in snow'));
      expect(out.data.imageUrl).toContain('width=512');
      expect(out.data.imageBase64).toBeUndefined();
    });
  });

  describe('huggingface provider', () => {
    const connId = '11111111-1111-4111-8111-111111111111';

    it('posts to the inference API with the bearer token and returns base64 bytes', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(
          new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } }),
        );
      const getConnection = jest.fn().mockResolvedValue({
        provider: 'huggingface',
        config: { apiKey: 'hf_secret' },
      });
      const action = new AiGenerateImageAction(fetchImpl, publicLookup);
      const input: NodeInput = {
        data: {},
        params: { provider: 'huggingface', prompt: 'a cat', connectionId: connId },
        connectionId: connId,
      };

      const out = await action.execute(input, baseContext({ getConnection }));

      expect(getConnection).toHaveBeenCalledWith(connId);
      const [, init] = fetchImpl.mock.calls[0];
      expect(init.headers.authorization).toBe('Bearer hf_secret');
      expect(out.data.provider).toBe('huggingface');
      expect(out.data.contentType).toBe('image/png');
      expect(out.data.imageBase64).toBe(Buffer.from(bytes).toString('base64'));
      expect(out.data.imageUrl).toBeUndefined();
    });

    it('rejects a connection that is not a huggingface connection (confused deputy)', async () => {
      const getConnection = jest
        .fn()
        .mockResolvedValue({ provider: 'openai', config: { apiKey: 'x' } });
      const action = new AiGenerateImageAction(jest.fn(), publicLookup);
      const input: NodeInput = {
        data: {},
        params: { provider: 'huggingface', prompt: 'a cat', connectionId: connId },
        connectionId: connId,
      };

      await expect(action.execute(input, baseContext({ getConnection }))).rejects.toThrow(
        /huggingface/i,
      );
    });

    it('mocks on dry-run when mockOnDryRun is set', async () => {
      const fetchImpl = jest.fn();
      const action = new AiGenerateImageAction(fetchImpl, publicLookup);
      const input: NodeInput = {
        data: {},
        params: {
          provider: 'huggingface',
          prompt: 'a cat',
          connectionId: connId,
          mockOnDryRun: true,
        },
        connectionId: connId,
      };

      const out = await action.execute(input, baseContext({ isDryRun: true }));

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(out.metadata?.mocked).toBe(true);
    });
  });
});
