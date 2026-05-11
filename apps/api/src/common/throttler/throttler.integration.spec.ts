import type { INestApplication } from '@nestjs/common';
import { Controller, Module, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import request from 'supertest';
import {
  DEFAULT_AI_GENERATE_THROTTLE_LIMIT,
  DEFAULT_AI_GENERATE_THROTTLE_TTL_MS,
  DEFAULT_THROTTLER_NAME,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
} from './throttler.config';
import { AppThrottlerModule } from './throttler.module';

@Controller('test')
class TestController {
  @Post('global')
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
    [DEFAULT_THROTTLER_NAME]: {
      ttl: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
      limit: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
    },
  })
  execute(): { ok: true } {
    return { ok: true };
  }

  @Post('ai-docs')
  @Throttle({
    [DEFAULT_THROTTLER_NAME]: {
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
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [
        () => ({
          THROTTLE_TTL_MS: 60_000,
          THROTTLE_LIMIT: 5,
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

  it('should enforce stricter AI limit than execute limit', () => {
    expect(DEFAULT_AI_GENERATE_THROTTLE_LIMIT).toBeLessThan(
      DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
    );
  });
});
