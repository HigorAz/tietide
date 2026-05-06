import { startFixture, jsonResponder, type Fixture } from '../__tests__/fixture-server';
import { MicrosoftHealthChecker } from './microsoft.checker';

describe('MicrosoftHealthChecker', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it('should hit /v1.0/me with Bearer token and return ok=true on 200', async () => {
    fixture = await startFixture(jsonResponder(200, { id: 'user-1', mail: 'a@example.com' }));
    const checker = new MicrosoftHealthChecker(fixture.baseUrl);

    const result = await checker.check({ accessToken: 'mstoken' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(true);
    expect(fixture.calls[0].url).toBe('/v1.0/me');
    expect(fixture.calls[0].headers.authorization).toBe('Bearer mstoken');
  });

  it('should return ok=false on 401', async () => {
    fixture = await startFixture(
      jsonResponder(401, { error: { message: 'InvalidAuthenticationToken' } }),
    );
    const checker = new MicrosoftHealthChecker(fixture.baseUrl);

    const result = await checker.check({ accessToken: 'expired' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('InvalidAuthenticationToken');
  });

  it('should return ok=false when accessToken is missing', async () => {
    const checker = new MicrosoftHealthChecker('http://127.0.0.1:1');

    const result = await checker.check({}, AbortSignal.timeout(50));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/accessToken/i);
  });
});
