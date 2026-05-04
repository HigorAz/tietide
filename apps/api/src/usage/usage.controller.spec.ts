import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

describe('UsageController (integration)', () => {
  let app: INestApplication;
  let usage: { getSummary: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const sampleSummary = {
    totalRuns: 142,
    successRate: 0.93,
    avgDurationMs: 4200,
    activeWorkflows: 7,
    runsPerDay: [{ date: '2026-04-28', count: 18 }],
    topWorkflows: [{ id: 'wf-a', name: 'Alpha', runs: 42, successRate: 0.95 }],
  };

  beforeEach(async () => {
    usage = { getSummary: jest.fn() };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [UsageController],
      providers: [{ provide: UsageService, useValue: usage }],
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

    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /usage/summary', () => {
    it('returns 200 with the summary on the happy path', async () => {
      usage.getSummary.mockResolvedValue(sampleSummary);

      const res = await request(app.getHttpServer()).get('/usage/summary').expect(200);

      expect(res.body).toEqual(sampleSummary);
    });

    it('returns 401 when no authenticated user is present', async () => {
      authedUser = null;

      await request(app.getHttpServer()).get('/usage/summary').expect(401);
      expect(usage.getSummary).not.toHaveBeenCalled();
    });

    it('passes the user.id from the JWT to the service (IDOR proof)', async () => {
      usage.getSummary.mockResolvedValue(sampleSummary);

      await request(app.getHttpServer()).get('/usage/summary').expect(200);

      expect(usage.getSummary).toHaveBeenCalledWith('owner-uuid', expect.any(String));
    });

    it('does not allow a forged userId from the query to override the JWT user', async () => {
      usage.getSummary.mockResolvedValue(sampleSummary);

      await request(app.getHttpServer())
        .get('/usage/summary')
        .query({ userId: 'forged-victim' })
        .expect(400); // forbidNonWhitelisted

      expect(usage.getSummary).not.toHaveBeenCalled();
    });

    it('forwards the range query parameter to the service', async () => {
      usage.getSummary.mockResolvedValue(sampleSummary);

      await request(app.getHttpServer()).get('/usage/summary').query({ range: '30d' }).expect(200);

      expect(usage.getSummary).toHaveBeenCalledWith('owner-uuid', '30d');
    });

    it('defaults the range to "7d" when omitted', async () => {
      usage.getSummary.mockResolvedValue(sampleSummary);

      await request(app.getHttpServer()).get('/usage/summary').expect(200);

      expect(usage.getSummary).toHaveBeenCalledWith('owner-uuid', '7d');
    });

    it('rejects an invalid range with 400', async () => {
      await request(app.getHttpServer()).get('/usage/summary').query({ range: '42d' }).expect(400);

      expect(usage.getSummary).not.toHaveBeenCalled();
    });

    it('accepts each of the three valid ranges', async () => {
      usage.getSummary.mockResolvedValue(sampleSummary);

      for (const range of ['7d', '30d', '90d']) {
        await request(app.getHttpServer()).get('/usage/summary').query({ range }).expect(200);
      }
      expect(usage.getSummary).toHaveBeenCalledTimes(3);
    });
  });
});
