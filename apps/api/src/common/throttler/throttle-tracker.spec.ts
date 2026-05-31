import { resolveThrottleTracker } from './throttle-tracker';

describe('resolveThrottleTracker', () => {
  it('uses req.ip when there is no proxy chain', () => {
    expect(resolveThrottleTracker({ ip: '203.0.113.5' })).toBe('203.0.113.5');
  });

  it('prefers the left-most forwarded IP (real client) over the socket IP', () => {
    // Express populates req.ips from X-Forwarded-For when trust proxy is on.
    expect(resolveThrottleTracker({ ip: '10.0.0.1', ips: ['203.0.113.9', '10.0.0.1'] })).toBe(
      '203.0.113.9',
    );
  });

  it('falls back to "unknown" when no IP is resolvable', () => {
    expect(resolveThrottleTracker({})).toBe('unknown');
  });

  it('scopes the bucket to the account on credential routes (ip + normalized email)', () => {
    expect(
      resolveThrottleTracker({ ip: '203.0.113.5', body: { email: '  Alice@Example.COM ' } }),
    ).toBe('203.0.113.5|alice@example.com');
  });

  it('ignores a non-string email body field', () => {
    expect(resolveThrottleTracker({ ip: '203.0.113.5', body: { email: { $ne: null } } })).toBe(
      '203.0.113.5',
    );
  });

  it('is stable for the same ip+email pair (deterministic bucket key)', () => {
    const a = resolveThrottleTracker({ ip: '1.2.3.4', body: { email: 'x@y.com' } });
    const b = resolveThrottleTracker({ ip: '1.2.3.4', body: { email: 'x@y.com' } });
    expect(a).toBe(b);
  });

  describe('per-tenant bucketing (W3.3)', () => {
    it('buckets an authenticated request by userId, not by IP', () => {
      expect(resolveThrottleTracker({ ip: '203.0.113.5', user: { id: 'user-1' } })).toBe(
        'user:user-1',
      );
    });

    it('keeps the same bucket for one user across different source IPs', () => {
      const a = resolveThrottleTracker({ ip: '203.0.113.5', user: { id: 'user-1' } });
      const b = resolveThrottleTracker({ ip: '198.51.100.9', user: { id: 'user-1' } });
      expect(a).toBe(b);
      expect(a).toBe('user:user-1');
    });

    it('gives different users distinct buckets even behind one shared IP', () => {
      const a = resolveThrottleTracker({ ip: '203.0.113.5', user: { id: 'user-1' } });
      const b = resolveThrottleTracker({ ip: '203.0.113.5', user: { id: 'user-2' } });
      expect(a).not.toBe(b);
    });

    it('prefers the authenticated userId over an email body field', () => {
      expect(
        resolveThrottleTracker({
          ip: '203.0.113.5',
          user: { id: 'user-1' },
          body: { email: 'x@y.com' },
        }),
      ).toBe('user:user-1');
    });

    it('ignores a non-string user id and falls back to IP', () => {
      expect(resolveThrottleTracker({ ip: '203.0.113.5', user: { id: { $ne: null } } })).toBe(
        '203.0.113.5',
      );
    });

    it('falls back to IP when there is no authenticated user', () => {
      expect(resolveThrottleTracker({ ip: '203.0.113.5', user: undefined })).toBe('203.0.113.5');
    });
  });
});
