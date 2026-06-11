import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { ConfigService } from '@nestjs/config';
import { resolveClientIp, type TrackableRequest } from './throttle-tracker';

export const DEFAULT_THROTTLER_NAME = 'default';
export const DEFAULT_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_THROTTLE_LIMIT = 100;
export const DEFAULT_AUTH_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_AUTH_THROTTLE_LIMIT = 5;
// Per-IP aggregate throttler (W5.9). Layered on top of the per-(ip,email) `default`
// bucket on credential routes so a single source IP cannot rotate the email field to
// spray one password across unlimited distinct accounts. 30/min sits well above a
// single (ip,email) bucket (so legit logins pass) yet far below the global ceiling.
export const IP_THROTTLER_NAME = 'ip';
export const DEFAULT_IP_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_IP_THROTTLE_LIMIT = 30;

// @nestjs/throttler stores a route's `@Throttle({ ip: ... })` limit metadata under
// `THROTTLER:LIMIT` + the throttler name. We read this key to make the `ip` throttler
// a pure opt-in layer: it skips every route that has NOT explicitly set an `ip` limit,
// so it never clamps the limits of non-credential routes (e.g. a route whose own
// `default` override exceeds the global ceiling). Only credential routes opt in.
const IP_THROTTLER_LIMIT_METADATA_KEY = `THROTTLER:LIMIT${IP_THROTTLER_NAME}`;
const ipThrottlerReflector = new Reflector();

/** True when the handled route did NOT opt into the per-IP aggregate cap. */
function shouldSkipIpThrottler(context: ExecutionContext): boolean {
  const optedIn = ipThrottlerReflector.getAllAndOverride(IP_THROTTLER_LIMIT_METADATA_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  return optedIn === undefined;
}
// Workflow execute (and dry-run /test): enqueues a BullMQ job. Worker
// concurrency is 5, so a per-user budget of 20/min absorbs editor bursts
// without letting one account bury the shared queue.
export const DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT = 20;
// AI doc generation: round-trips to FastAPI -> ChromaDB -> Ollama,
// ~10-60s of CPU per call. 3/min worst-cases at ~3 minutes of Ollama CPU.
export const DEFAULT_AI_GENERATE_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_AI_GENERATE_THROTTLE_LIMIT = 3;
// Public webhook ingress (inbound webhooks + provider webhooks) (W5.10). These
// routes are unauthenticated and do a Prisma findUnique (provider path also
// libsodium-decrypts the signing secret) BEFORE any auth/signature decision, so
// an unauthenticated flood of arbitrary :path/:subscriptionId values drives
// unbounded DB lookups + decrypts. They were previously @SkipThrottle() (never
// limited). Replace that with a GENEROUS-but-bounded per-IP cap: legitimate
// providers fan out across many source IPs and rarely exceed a few hundred
// hits/min from a single IP, so 300/IP/min leaves real bursts untouched while
// capping a single-IP flood. Keyed purely on the client IP (the `ip` named
// throttler) — there is no authenticated identity to bucket on here.
export const DEFAULT_WEBHOOK_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_WEBHOOK_THROTTLE_LIMIT = 300;
// Prometheus /metrics scrape (W5.36). Previously @SkipThrottle() (never limited)
// and reachable without a token when METRICS_TOKEN is unset, so an
// internet-exposed deploy that forgets the token served operational telemetry
// to anyone, unthrottled. Production now requires METRICS_TOKEN (default-closed),
// and this modest per-IP cap bounds an anonymous scrape flood while leaving a
// normal Prometheus scrape interval (typically 4-12/min) far below the ceiling.
export const DEFAULT_METRICS_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_METRICS_THROTTLE_LIMIT = 60;

export interface ThrottleSettings {
  ttl: number;
  limit: number;
}

export type AuthThrottleSettings = ThrottleSettings;

export function buildThrottlerOptions(config: ConfigService): ThrottlerModuleOptions {
  const ttl = config.get<number>('THROTTLE_TTL_MS', DEFAULT_THROTTLE_TTL_MS);
  const limit = config.get<number>('THROTTLE_LIMIT', DEFAULT_THROTTLE_LIMIT);
  return [
    {
      name: DEFAULT_THROTTLER_NAME,
      ttl,
      limit,
    },
    {
      // Second named throttler keyed purely on the client IP (W5.9). Pure opt-in:
      // `skipIf` skips it on every route that does NOT declare `@Throttle({ ip: ... })`,
      // so non-credential routes are completely unaffected (and it never clamps a route
      // whose own `default` override exceeds the global ceiling). Credential routes opt
      // in to bound the aggregate email-rotation spray budget. Its IP-only tracker
      // overrides the guard's email-aware getTracker so rotating the email field can
      // never mint fresh buckets — every request from one IP shares one bucket.
      name: IP_THROTTLER_NAME,
      ttl,
      limit,
      getTracker: (req: Record<string, unknown>) => resolveClientIp(req as TrackableRequest),
      skipIf: shouldSkipIpThrottler,
    },
  ];
}

export function buildAuthThrottleSettings(config: ConfigService): ThrottleSettings {
  return {
    ttl: config.get<number>('THROTTLE_AUTH_TTL_MS', DEFAULT_AUTH_THROTTLE_TTL_MS),
    limit: config.get<number>('THROTTLE_AUTH_LIMIT', DEFAULT_AUTH_THROTTLE_LIMIT),
  };
}

export function buildIpThrottleSettings(config: ConfigService): ThrottleSettings {
  return {
    ttl: config.get<number>('THROTTLE_IP_TTL_MS', DEFAULT_IP_THROTTLE_TTL_MS),
    limit: config.get<number>('THROTTLE_IP_LIMIT', DEFAULT_IP_THROTTLE_LIMIT),
  };
}

export function buildExecuteThrottleSettings(config: ConfigService): ThrottleSettings {
  return {
    ttl: config.get<number>('THROTTLE_EXECUTE_TTL_MS', DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS),
    limit: config.get<number>('THROTTLE_EXECUTE_LIMIT', DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT),
  };
}

export function buildAiThrottleSettings(config: ConfigService): ThrottleSettings {
  return {
    ttl: config.get<number>('THROTTLE_AI_TTL_MS', DEFAULT_AI_GENERATE_THROTTLE_TTL_MS),
    limit: config.get<number>('THROTTLE_AI_LIMIT', DEFAULT_AI_GENERATE_THROTTLE_LIMIT),
  };
}

export function buildWebhookThrottleSettings(config: ConfigService): ThrottleSettings {
  return {
    ttl: config.get<number>('THROTTLE_WEBHOOK_TTL_MS', DEFAULT_WEBHOOK_THROTTLE_TTL_MS),
    limit: config.get<number>('THROTTLE_WEBHOOK_LIMIT', DEFAULT_WEBHOOK_THROTTLE_LIMIT),
  };
}
