/**
 * Request shape we read for rate-limit bucketing. Kept minimal so the function
 * is trivially unit-testable without a real Express request.
 */
export interface TrackableRequest {
  ip?: string;
  ips?: string[];
  body?: { email?: unknown };
}

/**
 * Resolve the rate-limit bucket key for a request.
 *
 * - IP component: when `trust proxy` is enabled Express fills `req.ips` from
 *   `X-Forwarded-For` (left-most = real client); fall back to `req.ip`.
 * - On credential routes the body carries an `email`; we fold the normalized
 *   address into the key so a single source IP cannot cycle through many target
 *   accounts on one shared bucket, and each (IP, account) pair is tracked
 *   independently. Non-string email values (e.g. an injected `{$ne:null}`) are
 *   ignored.
 */
export function resolveThrottleTracker(req: TrackableRequest): string {
  const ip = (req.ips && req.ips.length > 0 ? req.ips[0] : req.ip) ?? 'unknown';
  const rawEmail = req.body?.email;
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : undefined;
  return email ? `${ip}|${email}` : ip;
}
