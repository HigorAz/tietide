import { startFixture, jsonResponder, type Fixture } from '../__tests__/fixture-server';
import { AnthropicHealthChecker } from './anthropic.checker';

describe('AnthropicHealthChecker', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it('should send x-api-key + anthropic-version on /v1/models and return ok=true on 200', async () => {
    fixture = await startFixture(jsonResponder(200, { data: [{ id: 'claude-opus-4-7' }] }));
    const checker = new AnthropicHealthChecker(fixture.baseUrl);

    const result = await checker.check({ apiKey: 'sk-ant-abc' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(true);
    expect(fixture.calls[0].method).toBe('GET');
    expect(fixture.calls[0].url).toBe('/v1/models');
    expect(fixture.calls[0].headers['x-api-key']).toBe('sk-ant-abc');
    expect(fixture.calls[0].headers['anthropic-version']).toBe('2023-06-01');
    expect(fixture.calls[0].headers.authorization).toBeUndefined();
  });

  it('should return ok=false on 401', async () => {
    fixture = await startFixture(
      jsonResponder(401, { error: { message: 'authentication_error' } }),
    );
    const checker = new AnthropicHealthChecker(fixture.baseUrl);

    const result = await checker.check({ apiKey: 'sk-ant-bad' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('authentication_error');
  });

  it('should return ok=false when apiKey is missing', async () => {
    const checker = new AnthropicHealthChecker('http://127.0.0.1:1');

    const result = await checker.check({}, AbortSignal.timeout(50));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/apiKey/i);
  });
});
