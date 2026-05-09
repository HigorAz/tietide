import { startFixture, jsonResponder, type Fixture } from '../__tests__/fixture-server';
import { OllamaHealthChecker } from './ollama.checker';

describe('OllamaHealthChecker', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it('should GET /api/tags using the connection-supplied baseUrl and return ok=true on 200', async () => {
    fixture = await startFixture(jsonResponder(200, { models: [] }));
    const checker = new OllamaHealthChecker();

    const result = await checker.check(
      { baseUrl: fixture.baseUrl, model: 'llama3.1:8b' },
      AbortSignal.timeout(5000),
    );

    expect(result.ok).toBe(true);
    expect(fixture.calls[0].method).toBe('GET');
    expect(fixture.calls[0].url).toBe('/api/tags');
  });

  it('should return ok=false on 5xx', async () => {
    fixture = await startFixture(jsonResponder(503, { error: 'service unavailable' }));
    const checker = new OllamaHealthChecker();

    const result = await checker.check({ baseUrl: fixture.baseUrl }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('503');
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
