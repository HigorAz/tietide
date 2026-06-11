import type { INestApplication } from '@nestjs/common';
import { Controller, Module, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import request from 'supertest';
import {
  AI_THROTTLER_NAME,
  DEFAULT_AI_GENERATE_THROTTLE_LIMIT,
  DEFAULT_AI_GENERATE_THROTTLE_TTL_MS,
  DEFAULT_THROTTLER_NAME,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
  EXECUTE_THROTTLER_NAME,
  IP_THROTTLER_NAME,
} from './throttler.config';
import { AppThrottlerModule } from './throttler.module';

@Controller('test')
class TestController {
  // Exercises the global `default` throttler. Overrides its limit to 5 locally so the
  // assertion stays independent of the module-wide THROTTLE_LIMIT (raised to 100 so the
  // per-category named caps can trip first on their own routes).
  @Post('global')
  @Throttle({ [DEFAULT_THROTTLER_NAME]: { ttl: 60_000, limit: 5 } })
  global(): { ok: true } {
    return { ok: true };
  }

  @Post('auth')
  @Throttle({ [DEFAULT_THROTTLER_NAME]: { ttl: 60_000, limit: 3 } })
  auth(): { ok: true } {
    return { ok: true };
  }

  @Post('execute')
  @Throttle({
    [EXECUTE_THROTTLER_NAME]: {
      ttl: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
      limit: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
    },
  })
  execute(): { ok: true } {
    return { ok: true };
  }

  @Post('ai-docs')
  @Throttle({
    [AI_THROTTLER_NAME]: {
      ttl: DEFAULT_AI_GENERATE_THROTTLE_TTL_MS,
      limit: DEFAULT_AI_GENERATE_THROTTLE_LIMIT,
    },
  })
  aiDocs(): { ok: true } {
    return { ok: true };
  }

  @Post('skip')
  @SkipThrottle()
  skip(): { ok: true } {
    return { ok: true };
  }

  // Credential-style route: layers the per-(ip,email) bucket (default) on top of a
  // per-IP aggregate cap (ip) — the W5.9 fix. default=3 per (ip,email), ip=5 per IP.
  @Post('credential')
  @Throttle({
    [DEFAULT_THROTTLER_NAME]: { ttl: 60_000, limit: 3 },
    [IP_THROTTLER_NAME]: { ttl: 60_000, limit: 5 },
  })
  credential(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [
        () => ({
          THROTTLE_TTL_MS: 60_000,
          // Global default kept high enough that the per-category named throttlers
          // (execute=20, ai=3) trip BEFORE the global ceiling on their routes, so the
          // execute/ai assertions below exercise the category cap, not the global one.
          // The dedicated /test/global route below overrides this to 5 locally.
          THROTTLE_LIMIT: 100,
        }),
      ],
    }),
    AppThrottlerModule,
  ],
  controllers: [TestController],
})
class TestAppModule {}

describe('AppThrottlerModule (integration)', () => {
  jest.setTimeout(15000);

  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should block requests on a stricter route after its threshold (3 → 429)', async () => {
    const url = '/test/auth';
    const server = app.getHttpServer();

    await request(server).post(url).expect(201);
    await request(server).post(url).expect(201);
    await request(server).post(url).expect(201);

    const blocked = await request(server).post(url);
    expect(blocked.status).toBe(429);
  });

  it('should allow requests under the global threshold and block when exceeded', async () => {
    const url = '/test/global';
    const server = app.getHttpServer();

    for (let i = 0; i < 5; i += 1) {
      await request(server).post(url).expect(201);
    }
    const blocked = await request(server).post(url);
    expect(blocked.status).toBe(429);
  });

  it('should not throttle endpoints decorated with @SkipThrottle()', async () => {
    const url = '/test/skip';
    const server = app.getHttpServer();

    for (let i = 0; i < 20; i += 1) {
      await request(server).post(url).expect(201);
    }
  });

  it(`should block /test/execute after ${DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT} requests`, async () => {
    const url = '/test/execute';
    const server = app.getHttpServer();

    for (let i = 0; i < DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT; i += 1) {
      await request(server).post(url).expect(201);
    }
    const blocked = await request(server).post(url);
    expect(blocked.status).toBe(429);
  });

  it(`should block /test/ai-docs after ${DEFAULT_AI_GENERATE_THROTTLE_LIMIT} requests`, async () => {
    const url = '/test/ai-docs';
    const server = app.getHttpServer();

    for (let i = 0; i < DEFAULT_AI_GENERATE_THROTTLE_LIMIT; i += 1) {
      await request(server).post(url).expect(201);
    }
    const blocked = await request(server).post(url);
    expect(blocked.status).toBe(429);
  });

  describe('W5.9 — per-IP aggregate cap layered on credential routes', () => {
    it('blocks a single IP that rotates distinct emails to spray credentials, once the IP cap is hit', async () => {
      const url = '/test/credential';
      const server = app.getHttpServer();

      // Each request uses a fresh email so the per-(ip,email) bucket never fills (1 hit each),
      // but they all share one source IP. The aggregate IP cap (5) must stop the spray.
      for (let i = 0; i < 5; i += 1) {
        await request(server)
          .post(url)
          .send({ email: `victim${i}@example.com` })
          .expect(201);
      }

      const blocked = await request(server)
        .post(url)
        .send({ email: 'victim-overflow@example.com' });
      expect(blocked.status).toBe(429);
    });

    it('still caps a single (ip,email) pair via the default bucket before the IP cap', async () => {
      const url = '/test/credential';
      const server = app.getHttpServer();

      // Same email every time: the per-(ip,email) bucket (3) trips first.
      await request(server).post(url).send({ email: 'one@example.com' }).expect(201);
      await request(server).post(url).send({ email: 'one@example.com' }).expect(201);
      await request(server).post(url).send({ email: 'one@example.com' }).expect(201);

      const blocked = await request(server).post(url).send({ email: 'one@example.com' });
      expect(blocked.status).toBe(429);
    });

    it('lets a legit low-rate login through (under both caps)', async () => {
      const url = '/test/credential';
      const server = app.getHttpServer();

      await request(server).post(url).send({ email: 'legit@example.com' }).expect(201);
      await request(server).post(url).send({ email: 'legit@example.com' }).expect(201);
    });
  });

  it('should enforce stricter AI limit than execute limit', () => {
    expect(DEFAULT_AI_GENERATE_THROTTLE_LIMIT).toBeLessThan(
      DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
    );
  });
});
