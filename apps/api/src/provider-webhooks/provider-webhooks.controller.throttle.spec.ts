import { Reflector } from '@nestjs/core';
import {
  THROTTLER_LIMIT,
  THROTTLER_SKIP,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import {
  DEFAULT_WEBHOOK_THROTTLE_LIMIT,
  DEFAULT_WEBHOOK_THROTTLE_TTL_MS,
  IP_THROTTLER_NAME,
} from '../common/throttler/throttler.config';
import { ProviderWebhooksController } from './provider-webhooks.controller';

/**
 * W5.10 regression: the public provider-webhook route must NOT be globally
 * exempted from throttling (`@SkipThrottle()`), and must opt into a bounded
 * per-IP cap via the `ip` named throttler. Without it an unauthenticated
 * attacker floods arbitrary :subscriptionId values, driving a Prisma
 * findUnique + libsodium decrypt of the signing secret per request before any
 * signature check.
 */
describe('ProviderWebhooksController throttle metadata (W5.10)', () => {
  const reflector = new Reflector();
  const handler = ProviderWebhooksController.prototype.receive;

  it('does NOT carry a blanket @SkipThrottle() on the controller class', () => {
    // @SkipThrottle() stores `THROTTLER:SKIPdefault = true`.
    const skip = reflector.getAllAndOverride<boolean>(`${THROTTLER_SKIP}default`, [
      handler,
      ProviderWebhooksController,
    ]);
    expect(skip).not.toBe(true);
  });

  it('opts into the per-IP aggregate throttler with a generous-but-bounded cap', () => {
    const limit = reflector.getAllAndOverride<unknown>(`${THROTTLER_LIMIT}${IP_THROTTLER_NAME}`, [
      handler,
      ProviderWebhooksController,
    ]);
    const ttl = reflector.getAllAndOverride<unknown>(`${THROTTLER_TTL}${IP_THROTTLER_NAME}`, [
      handler,
      ProviderWebhooksController,
    ]);

    expect(limit).toBeDefined();
    expect(ttl).toBeDefined();
    expect(limit).toBe(DEFAULT_WEBHOOK_THROTTLE_LIMIT);
    expect(ttl).toBe(DEFAULT_WEBHOOK_THROTTLE_TTL_MS);
  });

  it('keeps the cap generous enough for real provider bursts (>= 100/min)', () => {
    expect(DEFAULT_WEBHOOK_THROTTLE_LIMIT).toBeGreaterThanOrEqual(100);
  });
});
