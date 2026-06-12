import type { INestApplication } from '@nestjs/common';
import { Controller, Module, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Throttle } from '@nestjs/throttler';
import request from 'supertest';
import {
  AI_THROTTLER_NAME,
  AUTH_THROTTLER_NAME,
  DEFAULT_AI_GENERATE_THROTTLE_LIMIT,
  DEFAULT_AUTH_THROTTLE_LIMIT,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
  EXECUTE_THROTTLER_NAME,
} from './throttler.config';
import { AppThrottlerModule } from './throttler.module';

// The per-route decorator declares the COMPILE-TIME default limits. The env override
// (loaded below) must win: the W5.8 bug was that these static values pinned the cap and
// the documented THROTTLE_AUTH/EXECUTE/AI_* env vars were a no-op. Each route uses a
// distinct opt-in named throttler so the guard can substitute its env-resolved limit.
@Controller('t')
class EnvTestController {
  @Post('auth')
  @Throttle({
    [AUTH_THROTTLER_NAME]: { ttl: 60_000, limit: DEFAULT_AUTH_THROTTLE_LIMIT },
  })
  auth(): { ok: true } {
    return { ok: true };
  }

  @Post('execute')
  @Throttle({
    [EXECUTE_THROTTLER_NAME]: { ttl: 60_000, limit: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT },
  })
  execute(): { ok: true } {
    return { ok: true };
  }

  @Post('ai')
  @Throttle({
    [AI_THROTTLER_NAME]: { ttl: 60_000, limit: DEFAULT_AI_GENERATE_THROTTLE_LIMIT },
  })
  ai(): { ok: true } {
    return { ok: true };
  }
}

// Env override: tighter limits than every compile-time default. If env wins, the route
// blocks at these values; if the decorator wins (the bug), it blocks at the defaults.
const ENV_AUTH_LIMIT = 2;
const ENV_EXECUTE_LIMIT = 4;
const ENV_AI_LIMIT = 1;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [
        () => ({
          THROTTLE_TTL_MS: 60_000,
          THROTTLE_LIMIT: 1000,
          THROTTLE_AUTH_LIMIT: ENV_AUTH_LIMIT,
          THROTTLE_AUTH_TTL_MS: 60_000,
          THROTTLE_EXECUTE_LIMIT: ENV_EXECUTE_LIMIT,
          THROTTLE_EXECUTE_TTL_MS: 60_000,
          THROTTLE_AI_LIMIT: ENV_AI_LIMIT,
          THROTTLE_AI_TTL_MS: 60_000,
        }),
      ],
    }),
    AppThrottlerModule,
  ],
  controllers: [EnvTestController],
})
class EnvTestAppModule {}

describe('AppThrottlerModule — env-tunable per-category limits (W5.8)', () => {
  jest.setTimeout(15000);

  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [EnvTestAppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function blockedAt(path: string): Promise<number> {
    const server = app.getHttpServer();
    let allowed = 0;
    // Try well past the largest default so a no-op override is clearly detectable.
    for (let i = 0; i < 30; i += 1) {
      const res = await request(server).post(path);
      if (res.status === 429) {
        return allowed;
      }
      allowed += 1;
    }
    return allowed;
  }

  it('honours THROTTLE_AUTH_LIMIT over the per-route decorator default', async () => {
    expect(ENV_AUTH_LIMIT).toBeLessThan(DEFAULT_AUTH_THROTTLE_LIMIT);
    expect(await blockedAt('/t/auth')).toBe(ENV_AUTH_LIMIT);
  });

  it('honours THROTTLE_EXECUTE_LIMIT over the per-route decorator default', async () => {
    expect(ENV_EXECUTE_LIMIT).toBeLessThan(DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT);
    expect(await blockedAt('/t/execute')).toBe(ENV_EXECUTE_LIMIT);
  });

  it('honours THROTTLE_AI_LIMIT over the per-route decorator default', async () => {
    expect(await blockedAt('/t/ai')).toBe(ENV_AI_LIMIT);
  });
});
