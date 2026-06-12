import { OllamaHealthChecker } from './ollama.checker';
import type { LookupFn } from '../ssrf-guard';

// Self-hosted Ollama on a *public* host is legitimate: inject a lookup that
// resolves the hostname to a public address so the SSRF guard allows it, and
// mock fetch so no real network call is made.
const allowLookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];

// A lookup that pretends a public hostname resolves to an internal address.
const resolveToMetadata: LookupFn = async () => [{ address: '169.254.169.254', family: 4 }];

describe('OllamaHealthChecker', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    if (fetchSpy) fetchSpy.mockRestore();
  });

  it('should GET /api/tags using the connection-supplied baseUrl and return ok=true on 200', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));
    const checker = new OllamaHealthChecker(allowLookup);

    const result = await checker.check(
      { baseUrl: 'http://ollama.example.com:11434', model: 'llama3.1:8b' },
      AbortSignal.timeout(5000),
    );

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe('http://ollama.example.com:11434/api/tags');
    expect((init as RequestInit).method ?? 'GET').toBe('GET');
  });

  it('should return ok=false on 5xx', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'service unavailable' }), { status: 503 }),
      );
    const checker = new OllamaHealthChecker(allowLookup);

    const result = await checker.check(
      { baseUrl: 'http://ollama.example.com' },
      AbortSignal.timeout(5000),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('503');
  });

  it('should block a baseUrl that points at the cloud metadata endpoint (SSRF)', async () => {
    const checker = new OllamaHealthChecker();
    const result = await checker.check(
      { baseUrl: 'http://169.254.169.254' },
      AbortSignal.timeout(50),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/private or internal/i);
  });

  it('should block a baseUrl that resolves to a private address (DNS-based SSRF)', async () => {
    const checker = new OllamaHealthChecker(resolveToMetadata);
    const result = await checker.check(
      { baseUrl: 'http://ollama.internal.example' },
      AbortSignal.timeout(50),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/private or internal/i);
  });

  it('should block a loopback baseUrl', async () => {
    const checker = new OllamaHealthChecker();
    const result = await checker.check(
      { baseUrl: 'http://127.0.0.1:11434' },
      AbortSignal.timeout(50),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/private or internal/i);
  });

  it('should return ok=false when baseUrl is missing', async () => {
    const checker = new OllamaHealthChecker();
    const result = await checker.check({}, AbortSignal.timeout(50));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/baseUrl/i);
  });

  it('should return ok=false when baseUrl uses a non-http scheme', async () => {
    const checker = new OllamaHealthChecker();
    const result = await checker.check({ baseUrl: 'ftp://example.com' }, AbortSignal.timeout(50));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/http/i);
  });
});
