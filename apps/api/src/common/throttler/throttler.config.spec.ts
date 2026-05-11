import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_AI_GENERATE_THROTTLE_LIMIT,
  DEFAULT_AI_GENERATE_THROTTLE_TTL_MS,
  DEFAULT_AUTH_THROTTLE_LIMIT,
  DEFAULT_AUTH_THROTTLE_TTL_MS,
  DEFAULT_THROTTLER_NAME,
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_TTL_MS,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
  buildAiThrottleSettings,
  buildAuthThrottleSettings,
  buildExecuteThrottleSettings,
  buildThrottlerOptions,
} from './throttler.config';

describe('throttler.config', () => {
  function makeConfig(env: Record<string, unknown> = {}): ConfigService {
    return {
      get: <T>(key: string, fallback: T): T =>
        env[key] !== undefined ? (env[key] as T) : fallback,
    } as unknown as ConfigService;
  }

  describe('buildThrottlerOptions', () => {
    it('should produce a single default rate limit using sensible defaults', () => {
      const result = buildThrottlerOptions(makeConfig());

      expect(result).toEqual([
        {
          name: DEFAULT_THROTTLER_NAME,
          ttl: DEFAULT_THROTTLE_TTL_MS,
          limit: DEFAULT_THROTTLE_LIMIT,
        },
      ]);
    });

    it('should honour THROTTLE_TTL_MS / THROTTLE_LIMIT overrides', () => {
      const result = buildThrottlerOptions(
        makeConfig({ THROTTLE_TTL_MS: 30_000, THROTTLE_LIMIT: 200 }),
      );

      expect(result).toEqual([{ name: DEFAULT_THROTTLER_NAME, ttl: 30_000, limit: 200 }]);
    });
  });

  describe('buildAuthThrottleSettings', () => {
    it('should default to a stricter limit than the global throttle', () => {
      const result = buildAuthThrottleSettings(makeConfig());

      expect(result).toEqual({
        ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
        limit: DEFAULT_AUTH_THROTTLE_LIMIT,
      });
      expect(DEFAULT_AUTH_THROTTLE_LIMIT).toBeLessThan(DEFAULT_THROTTLE_LIMIT);
    });

    it('should honour THROTTLE_AUTH_TTL_MS / THROTTLE_AUTH_LIMIT overrides', () => {
      const result = buildAuthThrottleSettings(
        makeConfig({ THROTTLE_AUTH_TTL_MS: 120_000, THROTTLE_AUTH_LIMIT: 3 }),
      );

      expect(result).toEqual({ ttl: 120_000, limit: 3 });
    });
  });

  describe('buildExecuteThrottleSettings', () => {
    it('should default to a stricter limit than the global throttle', () => {
      const result = buildExecuteThrottleSettings(makeConfig());

      expect(result).toEqual({
        ttl: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
        limit: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
      });
      expect(DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT).toBeLessThan(DEFAULT_THROTTLE_LIMIT);
    });

    it('should honour THROTTLE_EXECUTE_TTL_MS / THROTTLE_EXECUTE_LIMIT overrides', () => {
      const result = buildExecuteThrottleSettings(
        makeConfig({ THROTTLE_EXECUTE_TTL_MS: 30_000, THROTTLE_EXECUTE_LIMIT: 50 }),
      );

      expect(result).toEqual({ ttl: 30_000, limit: 50 });
    });
  });

  describe('buildAiThrottleSettings', () => {
    it('should default to a tighter limit than execute (Ollama is CPU-bound)', () => {
      const result = buildAiThrottleSettings(makeConfig());

      expect(result).toEqual({
        ttl: DEFAULT_AI_GENERATE_THROTTLE_TTL_MS,
        limit: DEFAULT_AI_GENERATE_THROTTLE_LIMIT,
      });
      expect(DEFAULT_AI_GENERATE_THROTTLE_LIMIT).toBeLessThan(
        DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
      );
    });

    it('should honour THROTTLE_AI_TTL_MS / THROTTLE_AI_LIMIT overrides', () => {
      const result = buildAiThrottleSettings(
        makeConfig({ THROTTLE_AI_TTL_MS: 120_000, THROTTLE_AI_LIMIT: 2 }),
      );

      expect(result).toEqual({ ttl: 120_000, limit: 2 });
    });
  });
});
