import { startFixture, jsonResponder, type Fixture } from '../__tests__/fixture-server';
import { NotionHealthChecker } from './notion.checker';

describe('NotionHealthChecker', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it('should hit /v1/users/me with Bearer + Notion-Version and return ok=true on 200', async () => {
    fixture = await startFixture(jsonResponder(200, { id: 'bot-1', name: 'Acme' }));
    const checker = new NotionHealthChecker(fixture.baseUrl);

    const result = await checker.check({ accessToken: 'ntn_abc' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(true);
    expect(fixture.calls[0].url).toBe('/v1/users/me');
    expect(fixture.calls[0].headers.authorization).toBe('Bearer ntn_abc');
    expect(fixture.calls[0].headers['notion-version']).toBe('2022-06-28');
  });

  it('should return ok=false on 401', async () => {
    fixture = await startFixture(
      jsonResponder(401, { code: 'unauthorized', message: 'Invalid token' }),
    );
    const checker = new NotionHealthChecker(fixture.baseUrl);

    const result = await checker.check({ accessToken: 'expired' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Invalid token');
  });

  it('should return ok=false when accessToken is missing', async () => {
    const checker = new NotionHealthChecker('http://127.0.0.1:1');

    const result = await checker.check({}, AbortSignal.timeout(50));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/accessToken/i);
  });
});
