import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { resolveThrottleTracker, type TrackableRequest } from './throttle-tracker';

/**
 * ThrottlerGuard that buckets by the real client IP (proxy-aware) and, on
 * credential routes, by the targeted account email as well. See
 * {@link resolveThrottleTracker}. Registered globally in place of the stock
 * ThrottlerGuard.
 */
@Injectable()
export class TieTideThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return resolveThrottleTracker(req as TrackableRequest);
  }
}
