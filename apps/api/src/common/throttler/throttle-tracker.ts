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

  const ip = resolveClientIp(req);
  const rawEmail = req.body?.email;
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : undefined;
  return email ? `${ip}|${email}` : ip;
}

/**
 * Resolve the real client IP, ignoring any account/email scoping (W5.9).
 *
 * This is the tracker for the dedicated per-IP aggregate throttler that layers on
 * top of the per-(ip,email) {@link resolveThrottleTracker} bucket on credential
 * routes: because the email is never folded in, an attacker cannot mint fresh
 * buckets by rotating the email field — every request from one source IP lands in
 * the same bucket, so the aggregate spray budget is enforced regardless of how
 * many distinct target accounts are cycled.
 *
 * Proxy-aware: when `trust proxy` is enabled Express fills `req.ips` from
 * `X-Forwarded-For` (left-most = real client); otherwise it uses `req.ip`.
 */
export function resolveClientIp(req: TrackableRequest): string {
  return (req.ips && req.ips.length > 0 ? req.ips[0] : req.ip) ?? 'unknown';
}
