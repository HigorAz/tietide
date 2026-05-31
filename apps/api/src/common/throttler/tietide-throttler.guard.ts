import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { resolveThrottleTracker, type TrackableRequest } from './throttle-tracker';

interface BearerCarryingRequest extends TrackableRequest {
  headers?: { authorization?: unknown };
}

/**
 * ThrottlerGuard that buckets authenticated requests per-tenant (by verified
 * userId) and anonymous ones by the real client IP (proxy-aware), plus the
 * targeted account email on credential routes. See {@link resolveThrottleTracker}.
 *
 * The global throttler runs BEFORE the per-controller JwtAuthGuard, so
 * `req.user` is not yet populated here — we verify the bearer token ourselves to
 * obtain a trustworthy userId. Verification (not bare decoding) is essential:
 * otherwise a forged token could mint unlimited fresh buckets and bypass the
 * IP-based limit. An unverifiable/absent token simply falls back to IP bucketing.
 */
@Injectable()
export class TieTideThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as BearerCarryingRequest;
    const userId = this.extractVerifiedUserId(request);
    return resolveThrottleTracker({
      ip: request.ip,
      ips: request.ips,
      body: request.body,
      user: userId ? { id: userId } : undefined,
    });
  }

  /** Verify the bearer token and return its subject, or undefined if absent/invalid. */
  private extractVerifiedUserId(req: BearerCarryingRequest): string | undefined {
    const header = req.headers?.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      return undefined;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      return undefined;
    }
    try {
      const payload = this.jwt.verify<{ sub?: unknown; aud?: unknown }>(token);
      // OAuth-state tokens are not access tokens — never bucket by them.
      if (payload.aud === 'oauth-state') {
        return undefined;
      }
      return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : undefined;
    } catch {
      return undefined;
    }
  }
}
