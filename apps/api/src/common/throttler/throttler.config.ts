import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { ConfigService } from '@nestjs/config';

export const DEFAULT_THROTTLER_NAME = 'default';
export const DEFAULT_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_THROTTLE_LIMIT = 100;
export const DEFAULT_AUTH_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_AUTH_THROTTLE_LIMIT = 5;
// Workflow execute (and dry-run /test): enqueues a BullMQ job. Worker
// concurrency is 5, so a per-user budget of 20/min absorbs editor bursts
// without letting one account bury the shared queue.
export const DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT = 20;
// AI doc generation: round-trips to FastAPI -> ChromaDB -> Ollama,
// ~10-60s of CPU per call. 3/min worst-cases at ~3 minutes of Ollama CPU.
export const DEFAULT_AI_GENERATE_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_AI_GENERATE_THROTTLE_LIMIT = 3;

export interface ThrottleSettings {
  ttl: number;
  limit: number;
}

export type AuthThrottleSettings = ThrottleSettings;

export function buildThrottlerOptions(config: ConfigService): ThrottlerModuleOptions {
  return [
    {
      name: DEFAULT_THROTTLER_NAME,
      ttl: config.get<number>('THROTTLE_TTL_MS', DEFAULT_THROTTLE_TTL_MS),
      limit: config.get<number>('THROTTLE_LIMIT', DEFAULT_THROTTLE_LIMIT),
    },
  ];
}

export function buildAuthThrottleSettings(config: ConfigService): ThrottleSettings {
  return {
    ttl: config.get<number>('THROTTLE_AUTH_TTL_MS', DEFAULT_AUTH_THROTTLE_TTL_MS),
    limit: config.get<number>('THROTTLE_AUTH_LIMIT', DEFAULT_AUTH_THROTTLE_LIMIT),
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
