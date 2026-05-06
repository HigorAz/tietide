import {
  startFixture,
  jsonResponder,
  silentResponder,
  type Fixture,
} from '../__tests__/fixture-server';
import { OpenAIHealthChecker } from './openai.checker';

describe('OpenAIHealthChecker', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it('should return ok=true when /v1/models responds 200', async () => {
    fixture = await startFixture(jsonResponder(200, { data: [{ id: 'gpt-4' }] }));
    const checker = new OpenAIHealthChecker(fixture.baseUrl);

    const result = await checker.check({ apiKey: 'sk-abc' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0].method).toBe('GET');
    expect(fixture.calls[0].url).toBe('/v1/models');
    expect(fixture.calls[0].headers.authorization).toBe('Bearer sk-abc');
  });

  it('should forward optional organization as OpenAI-Organization header', async () => {
    fixture = await startFixture(jsonResponder(200, { data: [] }));
    const checker = new OpenAIHealthChecker(fixture.baseUrl);

    await checker.check({ apiKey: 'sk-abc', organization: 'org-1' }, AbortSignal.timeout(5000));

    expect(fixture.calls[0].headers['openai-organization']).toBe('org-1');
  });

  it('should return ok=false with message when 401', async () => {
    fixture = await startFixture(jsonResponder(401, { error: { message: 'Invalid API key' } }));
    const checker = new OpenAIHealthChecker(fixture.baseUrl);

    const result = await checker.check({ apiKey: 'sk-bad' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Invalid API key');
  });

  it('should return ok=false when the request times out', async () => {
    fixture = await startFixture(silentResponder());
    const checker = new OpenAIHealthChecker(fixture.baseUrl);

    const result = await checker.check({ apiKey: 'sk-abc' }, AbortSignal.timeout(50));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/timeout|aborted/i);
  });

  it('should return ok=false when config is missing apiKey', async () => {
    const checker = new OpenAIHealthChecker('http://127.0.0.1:1');

    const result = await checker.check({}, AbortSignal.timeout(50));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/apiKey/i);
  });
});
