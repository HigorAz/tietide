/**
 * Request shape we read for rate-limit bucketing. Kept minimal so the function
 * is trivially unit-testable without a real Express request. `user` is populated
 * by JwtAuthGuard on authenticated routes.
 */
export interface TrackableRequest {
  ip?: string;
  ips?: string[];
  body?: { email?: unknown };
  user?: { id?: unknown };
}

/**
 * Resolve the rate-limit bucket key for a request.
 *
 * - Authenticated requests bucket by `user:<userId>` (W3.3): the limit is
 *   per-tenant and follows the account across source IPs, so a user cannot
 *   multiply their allowance by rotating IPs and tenants behind a shared
 *   egress IP (NAT, corporate proxy) don't share one another's bucket.
 * - Anonymous requests fall back to the real client IP: when `trust proxy` is
 *   enabled Express fills `req.ips` from `X-Forwarded-For` (left-most = real
 *   client); otherwise `req.ip`.
 * - On (unauthenticated) credential routes the body carries an `email`; we fold
 *   the normalized address into the key so a single source IP cannot cycle
 *   through many target accounts on one shared bucket. Non-string `email`/`id`
 *   values (e.g. an injected `{$ne:null}`) are ignored.
 */
export function resolveThrottleTracker(req: TrackableRequest): string {
  const rawUserId = req.user?.id;
  if (typeof rawUserId === 'string' && rawUserId.length > 0) {
    return `user:${rawUserId}`;
  }

  const ip = (req.ips && req.ips.length > 0 ? req.ips[0] : req.ip) ?? 'unknown';
  const rawEmail = req.body?.email;
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : undefined;
  return email ? `${ip}|${email}` : ip;
}
