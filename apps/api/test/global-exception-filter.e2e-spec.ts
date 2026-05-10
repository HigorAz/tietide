import {
  Controller,
  Get,
  HttpStatus,
  Module,
  NotFoundException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { buildLoggerOptions, REQUEST_ID_HEADER } from '../src/common/logger/logger.config';

@Controller()
class ThrowController {
  @Get('__throw')
  throwAtRoot(): void {
    throw new NotFoundException('not here');
  }

  @Get('webhooks/__throw')
  throwAtWebhook(): void {
    throw new NotFoundException('webhook gone');
  }

  @Get('provider-webhooks/__throw')
  throwAtProviderWebhook(): void {
    throw new NotFoundException('provider hook gone');
  }
}

@Module({
  imports: [LoggerModule.forRoot(buildLoggerOptions())],
  controllers: [ThrowController],
})
class TestAppModule {}

describe('GlobalExceptionFilter (e2e — through pino-http genReqId)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should set X-Request-Id and echo it as body.requestId on regular routes', async () => {
    const res = await request(app.getHttpServer()).get('/v1/__throw').expect(HttpStatus.NOT_FOUND);

    const headerId = res.headers[REQUEST_ID_HEADER];
    expect(typeof headerId).toBe('string');
    expect((headerId as string).length).toBeGreaterThan(0);

    expect(res.body).toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      code: 'NOT_FOUND',
      message: 'not here',
      requestId: headerId,
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('should echo a caller-supplied X-Request-Id when present', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/__throw')
      .set(REQUEST_ID_HEADER, 'caller-trace-001')
      .expect(HttpStatus.NOT_FOUND);

    expect(res.headers[REQUEST_ID_HEADER]).toBe('caller-trace-001');
    expect(res.body.requestId).toBe('caller-trace-001');
  });

  it('should omit requestId from the body for /v1/webhooks/* routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/webhooks/__throw')
      .expect(HttpStatus.NOT_FOUND);

    expect(typeof res.headers[REQUEST_ID_HEADER]).toBe('string');
    expect(res.body).not.toHaveProperty('requestId');
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'webhook gone' });
  });

  it('should omit requestId from the body for /v1/provider-webhooks/* routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/provider-webhooks/__throw')
      .expect(HttpStatus.NOT_FOUND);

    expect(typeof res.headers[REQUEST_ID_HEADER]).toBe('string');
    expect(res.body).not.toHaveProperty('requestId');
  });

  it('should never include a stack trace in the body', async () => {
    const res = await request(app.getHttpServer()).get('/v1/__throw').expect(HttpStatus.NOT_FOUND);

    expect(res.body).not.toHaveProperty('stack');
  });
});
