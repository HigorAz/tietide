import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { ConfigService } from '@nestjs/config';

export const DEFAULT_THROTTLER_NAME = 'default';
export const DEFAULT_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_THROTTLE_LIMIT = 100;
export const DEFAULT_AUTH_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_AUTH_THROTTLE_LIMIT = 5;

export interface AuthThrottleSettings {
  ttl: number;
  limit: number;
}

export function buildThrottlerOptions(config: ConfigService): ThrottlerModuleOptions {
  return [
    {
      name: DEFAULT_THROTTLER_NAME,
      ttl: config.get<number>('THROTTLE_TTL_MS', DEFAULT_THROTTLE_TTL_MS),
      limit: config.get<number>('THROTTLE_LIMIT', DEFAULT_THROTTLE_LIMIT),
    },
  ];
}

export function buildAuthThrottleSettings(config: ConfigService): AuthThrottleSettings {
  return {
    ttl: config.get<number>('THROTTLE_AUTH_TTL_MS', DEFAULT_AUTH_THROTTLE_TTL_MS),
    limit: config.get<number>('THROTTLE_AUTH_LIMIT', DEFAULT_AUTH_THROTTLE_LIMIT),
  };
}
