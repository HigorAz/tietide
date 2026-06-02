import { timingSafeEqual } from 'node:crypto';

/**
 * Decide whether a `/metrics` scrape is authorized. When no `METRICS_TOKEN` is
 * configured the endpoint is open (dev / network-isolated deployments). When a
 * token is configured, callers must present `Authorization: Bearer <token>`,
 * compared in constant time. Metrics expose operational data, so gating is
 * opt-in but recommended for internet-exposed deployments.
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
