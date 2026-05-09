import { startFixture, jsonResponder, type Fixture } from '../__tests__/fixture-server';
import { AirtableHealthChecker } from './airtable.checker';

describe('AirtableHealthChecker', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it('should hit /v0/meta/whoami with Bearer apiKey and return ok=true on 200', async () => {
    fixture = await startFixture(jsonResponder(200, { id: 'usrAAA' }));
    const checker = new AirtableHealthChecker(fixture.baseUrl);

    const result = await checker.check({ apiKey: 'patAAA.111' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(true);
    expect(fixture.calls[0].url).toBe('/v0/meta/whoami');
    expect(fixture.calls[0].headers.authorization).toBe('Bearer patAAA.111');
  });

  it('should return ok=false on 401', async () => {
    fixture = await startFixture(
      jsonResponder(401, { error: { message: 'Authentication required' } }),
    );
    const checker = new AirtableHealthChecker(fixture.baseUrl);

    const result = await checker.check({ apiKey: 'expired' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Authentication required');
  });

  it('should return ok=false when apiKey is missing', async () => {
    const checker = new AirtableHealthChecker('http://127.0.0.1:1');
    const result = await checker.check({}, AbortSignal.timeout(50));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/apiKey/i);
  });
});
