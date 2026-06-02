import { isMetricsAuthorized } from './metrics-auth';

describe('isMetricsAuthorized (worker)', () => {
  it('allows any caller when no token is configured', () => {
    expect(isMetricsAuthorized(undefined, undefined)).toBe(true);
    expect(isMetricsAuthorized('', 'Bearer x')).toBe(true);
  });

  it('accepts the correct bearer token', () => {
    expect(isMetricsAuthorized('s3cret', 'Bearer s3cret')).toBe(true);
  });

  it('rejects wrong/missing/badly-scoped tokens', () => {
    expect(isMetricsAuthorized('s3cret', 'Bearer nope')).toBe(false);
    expect(isMetricsAuthorized('s3cret', undefined)).toBe(false);
    expect(isMetricsAuthorized('s3cret', 's3cret')).toBe(false);
    expect(isMetricsAuthorized('s3cret', 'Bearer longer-than-secret')).toBe(false);
  });
});
