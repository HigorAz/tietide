import { startFixture, jsonResponder, type Fixture } from '../__tests__/fixture-server';
import { LinearHealthChecker } from './linear.checker';

describe('LinearHealthChecker', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it('should POST { viewer { id } } with raw apiKey header and return ok=true on success', async () => {
    fixture = await startFixture(jsonResponder(200, { data: { viewer: { id: 'me' } } }));
    const checker = new LinearHealthChecker(fixture.baseUrl);

    const result = await checker.check({ apiKey: 'lin_api_xyz' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(true);
    expect(fixture.calls[0].method).toBe('POST');
    expect(fixture.calls[0].headers.authorization).toBe('lin_api_xyz');
    expect(fixture.calls[0].body).toContain('viewer');
  });

  it('should return ok=false when GraphQL response carries errors[]', async () => {
    fixture = await startFixture(
      jsonResponder(200, { errors: [{ message: 'Authentication required' }] }),
    );
    const checker = new LinearHealthChecker(fixture.baseUrl);

    const result = await checker.check({ apiKey: 'expired' }, AbortSignal.timeout(5000));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Authentication required');
  });

  it('should return ok=false when apiKey is missing', async () => {
    const checker = new LinearHealthChecker('http://127.0.0.1:1');
    const result = await checker.check({}, AbortSignal.timeout(50));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/apiKey/i);
  });
});
