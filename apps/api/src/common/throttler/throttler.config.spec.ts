import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_AI_GENERATE_THROTTLE_LIMIT,
  DEFAULT_AI_GENERATE_THROTTLE_TTL_MS,
  DEFAULT_AUTH_THROTTLE_LIMIT,
  DEFAULT_AUTH_THROTTLE_TTL_MS,
  DEFAULT_IP_THROTTLE_LIMIT,
  DEFAULT_IP_THROTTLE_TTL_MS,
  DEFAULT_THROTTLER_NAME,
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_TTL_MS,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
  IP_THROTTLER_NAME,
  buildAiThrottleSettings,
  buildAuthThrottleSettings,
  buildExecuteThrottleSettings,
  buildIpThrottleSettings,
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
    it('should produce a default and a per-IP aggregate throttler using sensible defaults', () => {
      const result = buildThrottlerOptions(makeConfig());

      expect(Array.isArray(result)).toBe(true);
      const throttlers = result as Array<{ name?: string; ttl: number; limit: number }>;

      const def = throttlers.find((t) => t.name === DEFAULT_THROTTLER_NAME);
      expect(def).toMatchObject({
        name: DEFAULT_THROTTLER_NAME,
        ttl: DEFAULT_THROTTLE_TTL_MS,
        limit: DEFAULT_THROTTLE_LIMIT,
      });

      // W5.9: a second named throttler keyed purely on IP must exist so a single
      // IP cannot rotate the email field to spray credentials past the per-(ip,email) bucket.
      const ip = throttlers.find((t) => t.name === IP_THROTTLER_NAME);
      expect(ip).toBeDefined();
      expect(ip).toMatchObject({
        name: IP_THROTTLER_NAME,
        ttl: DEFAULT_THROTTLE_TTL_MS,
        limit: DEFAULT_THROTTLE_LIMIT,
      });
      // It must carry its own IP-only tracker (overriding the guard's email-aware one).
      expect(typeof (ip as { getTracker?: unknown }).getTracker).toBe('function');
    });

    it('should honour THROTTLE_TTL_MS / THROTTLE_LIMIT overrides on both throttlers', () => {
      const result = buildThrottlerOptions(
        makeConfig({ THROTTLE_TTL_MS: 30_000, THROTTLE_LIMIT: 200 }),
      );
      const throttlers = result as Array<{ name?: string; ttl: number; limit: number }>;

      expect(throttlers.find((t) => t.name === DEFAULT_THROTTLER_NAME)).toMatchObject({
        ttl: 30_000,
        limit: 200,
      });
      expect(throttlers.find((t) => t.name === IP_THROTTLER_NAME)).toMatchObject({
        ttl: 30_000,
        limit: 200,
      });
    });
  });

  describe('buildIpThrottleSettings', () => {
    it('should default to an aggregate per-IP credential budget', () => {
      const result = buildIpThrottleSettings(makeConfig());

      expect(result).toEqual({
        ttl: DEFAULT_IP_THROTTLE_TTL_MS,
        limit: DEFAULT_IP_THROTTLE_LIMIT,
      });
      // The aggregate IP cap must be looser than a single (ip,email) bucket so legit
      // logins pass, but tighter than the global ceiling so email-rotation is bounded.
      expect(DEFAULT_IP_THROTTLE_LIMIT).toBeGreaterThan(DEFAULT_AUTH_THROTTLE_LIMIT);
      expect(DEFAULT_IP_THROTTLE_LIMIT).toBeLessThan(DEFAULT_THROTTLE_LIMIT);
    });

    it('should honour THROTTLE_IP_TTL_MS / THROTTLE_IP_LIMIT overrides', () => {
      const result = buildIpThrottleSettings(
        makeConfig({ THROTTLE_IP_TTL_MS: 120_000, THROTTLE_IP_LIMIT: 12 }),
      );

      expect(result).toEqual({ ttl: 120_000, limit: 12 });
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
