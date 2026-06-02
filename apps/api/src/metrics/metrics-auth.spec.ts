import { isMetricsAuthorized } from './metrics-auth';

describe('isMetricsAuthorized', () => {
  it('allows any caller when no token is configured', () => {
    expect(isMetricsAuthorized(undefined, undefined)).toBe(true);
    expect(isMetricsAuthorized('', 'Bearer whatever')).toBe(true);
    expect(isMetricsAuthorized('   ', undefined)).toBe(true);
  });

  it('accepts the correct bearer token when configured', () => {
    expect(isMetricsAuthorized('s3cret', 'Bearer s3cret')).toBe(true);
  });

  it('rejects a wrong or missing token when configured', () => {
    expect(isMetricsAuthorized('s3cret', 'Bearer nope')).toBe(false);
    expect(isMetricsAuthorized('s3cret', undefined)).toBe(false);
    expect(isMetricsAuthorized('s3cret', 's3cret')).toBe(false); // no Bearer scheme
    expect(isMetricsAuthorized('s3cret', 'Bearer ')).toBe(false);
  });

  it('rejects a token of a different length without throwing', () => {
    expect(isMetricsAuthorized('short', 'Bearer a-much-longer-token')).toBe(false);
  });
});
