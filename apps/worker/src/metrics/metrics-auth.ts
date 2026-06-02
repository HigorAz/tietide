import { timingSafeEqual } from 'node:crypto';

/**
 * Decide whether a `/metrics` scrape is authorized. Mirrors the API's helper
 * (apps/api/src/metrics/metrics-auth.ts): open when no `METRICS_TOKEN` is set,
 * otherwise requires a constant-time-matched `Authorization: Bearer <token>`.
 */
export function isMetricsAuthorized(
  configuredToken: string | undefined,
  authorizationHeader: unknown,
): boolean {
  const token = configuredToken?.trim();
  if (!token) {
    return true;
  }
  if (typeof authorizationHeader !== 'string' || !authorizationHeader.startsWith('Bearer ')) {
    return false;
  }
  const presented = authorizationHeader.slice('Bearer '.length).trim();
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(token, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
