import { HttpHealthChecker } from './http.checker';

describe('HttpHealthChecker', () => {
  const checker = new HttpHealthChecker();
  const signal = AbortSignal.timeout(1000);

  it('exposes the http provider id', () => {
    expect(checker.provider).toBe('http');
  });

  it('returns ok=true with an informational message for a valid bearer config', async () => {
    const result = await checker.check({ authType: 'bearer', token: 'x' }, signal);

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/HTTP Request node/i);
  });

  it('returns ok=true for apiKey and basic configs', async () => {
    const apiKey = await checker.check(
      { authType: 'apiKey', headerName: 'X-Api-Key', apiKey: 'k' },
      signal,
    );
    const basic = await checker.check({ authType: 'basic', username: 'u', password: 'p' }, signal);

    expect(apiKey.ok).toBe(true);
    expect(basic.ok).toBe(true);
  });

  it('returns ok=false when authType is missing or invalid', async () => {
    const result = await checker.check({ token: 'x' }, signal);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/authType/i);
  });
});
