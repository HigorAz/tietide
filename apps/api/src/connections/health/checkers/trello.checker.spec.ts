import { startFixture, jsonResponder, type Fixture } from '../__tests__/fixture-server';
import { TrelloHealthChecker } from './trello.checker';

describe('TrelloHealthChecker', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it('should hit /1/members/me with key+token query params and return ok=true on 200', async () => {
    fixture = await startFixture(jsonResponder(200, { id: 'm1', username: 'octocat' }));
    const checker = new TrelloHealthChecker(fixture.baseUrl);

    const result = await checker.check(
      { apiKey: 'devkey', token: 'usrtoken' },
      AbortSignal.timeout(5000),
    );

    expect(result.ok).toBe(true);
    const url = new URL(`${fixture.baseUrl}${fixture.calls[0].url}`);
    expect(url.pathname).toBe('/1/members/me');
    expect(url.searchParams.get('key')).toBe('devkey');
    expect(url.searchParams.get('token')).toBe('usrtoken');
  });

  it('should return ok=false on 401', async () => {
    fixture = await startFixture((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('invalid key');
    });
    const checker = new TrelloHealthChecker(fixture.baseUrl);

    const result = await checker.check(
      { apiKey: 'devkey', token: 'bad' },
      AbortSignal.timeout(5000),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('invalid key');
  });

  it('should return ok=false when apiKey is missing', async () => {
    const checker = new TrelloHealthChecker('http://127.0.0.1:1');
    const result = await checker.check({ token: 't' }, AbortSignal.timeout(50));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/apiKey/i);
  });

  it('should return ok=false when token is missing', async () => {
    const checker = new TrelloHealthChecker('http://127.0.0.1:1');
    const result = await checker.check({ apiKey: 'k' }, AbortSignal.timeout(50));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/token/i);
  });
});
