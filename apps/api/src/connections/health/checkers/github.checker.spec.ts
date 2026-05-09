import { startFixture, jsonResponder, type Fixture } from '../__tests__/fixture-server';
import { GitHubHealthChecker } from './github.checker';

describe('GitHubHealthChecker', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it('should hit /user with Bearer + GitHub headers and return ok=true on 200', async () => {
    fixture = await startFixture(jsonResponder(200, { login: 'octocat', id: 1 }));
    const checker = new GitHubHealthChecker(fixture.baseUrl);

    const result = await checker.check({ apiKey: 'ghp_AAA' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(true);
    expect(fixture.calls[0].url).toBe('/user');
    expect(fixture.calls[0].headers.authorization).toBe('Bearer ghp_AAA');
    expect(fixture.calls[0].headers.accept).toBe('application/vnd.github+json');
  });

  it('should return ok=false on 401', async () => {
    fixture = await startFixture(jsonResponder(401, { message: 'Bad credentials' }));
    const checker = new GitHubHealthChecker(fixture.baseUrl);

    const result = await checker.check({ apiKey: 'expired' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Bad credentials');
  });

  it('should return ok=false when apiKey is missing', async () => {
    const checker = new GitHubHealthChecker('http://127.0.0.1:1');
    const result = await checker.check({}, AbortSignal.timeout(50));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/apiKey/i);
  });
});
