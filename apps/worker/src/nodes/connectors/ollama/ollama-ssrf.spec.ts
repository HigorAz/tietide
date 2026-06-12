import type { DecryptedConnection } from '@tietide/sdk';
import type { OllamaConfig } from '@tietide/shared';
import { OllamaClientFactory } from './ollama-client.factory';
import { SsrfBlockedError, type LookupFn } from '../../actions/ssrf-guard';

jest.setTimeout(15000);

const makeConnection = (baseUrl: string): DecryptedConnection<OllamaConfig> => ({
  id: '33333333-3333-4333-8333-333333333333',
  type: 'API_KEY',
  provider: 'ollama',
  config: { baseUrl, model: 'llama3.1:8b' },
  refreshToken: undefined,
});

// Lookups that pretend a public hostname resolves to an internal address — the
// SSRF guard must reject these before fetch() is ever called.
const resolveToLoopback: LookupFn = async () => [{ address: '127.0.0.1', family: 4 }];
const resolveToMetadata: LookupFn = async () => [{ address: '169.254.169.254', family: 4 }];
const resolveToPublic: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];

describe('OllamaClientFactory SSRF guard', () => {
  let factory: OllamaClientFactory;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    factory = new OllamaClientFactory(resolveToPublic);
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ response: 'ok', embedding: [1, 2] }), { status: 200 }),
      );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('generate', () => {
    it('blocks a literal loopback baseUrl before any fetch', async () => {
      await expect(
        factory.generate(makeConnection('http://127.0.0.1:11434'), {
          model: 'm',
          prompt: 'p',
        }),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('blocks the cloud metadata endpoint', async () => {
      await expect(
        factory.generate(makeConnection('http://169.254.169.254'), {
          model: 'm',
          prompt: 'p',
        }),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('blocks a hostname that resolves to a private address (DNS-based SSRF)', async () => {
      factory = new OllamaClientFactory(resolveToLoopback);
      await expect(
        factory.generate(makeConnection('http://evil.example.com'), {
          model: 'm',
          prompt: 'p',
        }),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('allows a baseUrl that resolves to a public address', async () => {
      await expect(
        factory.generate(makeConnection('http://ollama.example.com:11434'), {
          model: 'm',
          prompt: 'p',
        }),
      ).resolves.toMatchObject({ text: 'ok' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('embeddings', () => {
    it('blocks an internal hostname resolving to metadata', async () => {
      factory = new OllamaClientFactory(resolveToMetadata);
      await expect(
        factory.embeddings(makeConnection('http://chromadb'), { model: 'm', prompt: 'p' }),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('allows a public endpoint', async () => {
      await expect(
        factory.embeddings(makeConnection('http://ollama.example.com'), {
          model: 'm',
          prompt: 'p',
        }),
      ).resolves.toMatchObject({ dimensions: 2 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
