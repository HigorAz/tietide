import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

describe('DemoController (integration)', () => {
  let app: INestApplication;
  let demoService: { seedForUser: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const seedResult = {
    workflows: [
      {
        slug: 'webhook-conditional-notification',
        workflowId: '11111111-1111-1111-1111-111111111111',
        name: 'Demo: Webhook → Enrich → IF → Notify',
        isActive: true,
        alreadyExisted: false,
        webhookPath: 'webhook-demo-owner-uu',
      },
    ],
  };

  beforeEach(async () => {
    demoService = { seedForUser: jest.fn() };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DemoController],
      providers: [{ provide: DemoService, useValue: demoService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (!authedUser) {
            throw new UnauthorizedException('Missing or invalid token');
          }
          const req = ctx.switchToHttp().getRequest<{ user: unknown }>();
          req.user = authedUser;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /demo/seed', () => {
    it('should return 200 with the seeded payload', async () => {
      demoService.seedForUser.mockResolvedValue(seedResult);

      const res = await request(app.getHttpServer()).post('/demo/seed').expect(200);

      expect(res.body).toEqual(seedResult);
    });

    it('should call the service with the authenticated user id, not any value from the body', async () => {
      demoService.seedForUser.mockResolvedValue(seedResult);

      await request(app.getHttpServer())
        .post('/demo/seed')
        .send({ userId: 'forged-id' })
        .expect(200);

      expect(demoService.seedForUser).toHaveBeenCalledWith('owner-uuid');
    });

    it('should return 401 when the guard rejects the request', async () => {
      authedUser = null;

      await request(app.getHttpServer()).post('/demo/seed').expect(401);
      expect(demoService.seedForUser).not.toHaveBeenCalled();
    });
  });
});
