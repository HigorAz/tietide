import { startFixture, jsonResponder, type Fixture } from '../__tests__/fixture-server';
import { SlackHealthChecker } from './slack.checker';

describe('SlackHealthChecker', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it('should POST /api/auth.test with Bearer token and return ok=true when body.ok=true', async () => {
    fixture = await startFixture(jsonResponder(200, { ok: true, team: 'Acme', user: 'bot' }));
    const checker = new SlackHealthChecker(fixture.baseUrl);

    const result = await checker.check({ accessToken: 'xoxb-abc' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(true);
    expect(fixture.calls[0].method).toBe('POST');
    expect(fixture.calls[0].url).toBe('/api/auth.test');
    expect(fixture.calls[0].headers.authorization).toBe('Bearer xoxb-abc');
  });

  it('should return ok=false when 200 but body.ok=false (Slack convention)', async () => {
    fixture = await startFixture(jsonResponder(200, { ok: false, error: 'invalid_auth' }));
    const checker = new SlackHealthChecker(fixture.baseUrl);

    const result = await checker.check({ accessToken: 'xoxb-bad' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('invalid_auth');
  });

  it('should return ok=false on non-2xx', async () => {
    fixture = await startFixture(jsonResponder(500, { error: 'internal' }));
    const checker = new SlackHealthChecker(fixture.baseUrl);

    const result = await checker.check({ accessToken: 'xoxb-abc' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(false);
  });

  it('should return ok=false when accessToken is missing', async () => {
    const checker = new SlackHealthChecker('http://127.0.0.1:1');

    const result = await checker.check({}, AbortSignal.timeout(50));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/accessToken/i);
  });
});
