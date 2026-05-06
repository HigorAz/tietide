import { startFixture, jsonResponder, type Fixture } from '../__tests__/fixture-server';
import { GoogleHealthChecker } from './google.checker';

describe('GoogleHealthChecker', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it('should hit the userinfo URL with Bearer token and return ok=true on 200', async () => {
    fixture = await startFixture(jsonResponder(200, { sub: '1', email: 'a@example.com' }));
    const checker = new GoogleHealthChecker(`${fixture.baseUrl}/userinfo`);

    const result = await checker.check(
      { accessToken: 'ya29.abc', refreshToken: 'r', scope: 's', tokenType: 'Bearer' },
      AbortSignal.timeout(5000),
    );

    expect(result.ok).toBe(true);
    expect(fixture.calls[0].method).toBe('GET');
    expect(fixture.calls[0].url).toBe('/userinfo');
    expect(fixture.calls[0].headers.authorization).toBe('Bearer ya29.abc');
  });

  it('should return ok=false on 401 (token expired/revoked)', async () => {
    fixture = await startFixture(jsonResponder(401, { error: 'invalid_token' }));
    const checker = new GoogleHealthChecker(`${fixture.baseUrl}/userinfo`);

    const result = await checker.check({ accessToken: 'expired' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/invalid_token|401/);
  });

  it('should return ok=false when accessToken is missing', async () => {
    const checker = new GoogleHealthChecker('http://127.0.0.1:1/userinfo');

    const result = await checker.check({}, AbortSignal.timeout(50));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/accessToken/i);
  });
});
