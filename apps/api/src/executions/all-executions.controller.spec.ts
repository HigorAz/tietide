import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import { AllExecutionsController } from './all-executions.controller';
import { ExecutionsService } from './executions.service';

describe('AllExecutionsController (integration)', () => {
  let app: INestApplication;
  let executionsService: { listAllForOrg: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const orgId = 'org-uuid-aaaa';

  const sampleItem = {
    id: '11111111-1111-4111-8111-111111111111',
    workflowId: '550e8400-e29b-41d4-a716-446655440000',
    status: 'SUCCESS',
    triggerType: 'manual',
    triggerData: null,
    idempotencyKey: null,
    startedAt: '2026-04-20T10:00:00.000Z',
    finishedAt: '2026-04-20T10:00:05.000Z',
    error: null,
    createdAt: '2026-04-20T09:59:00.000Z',
  };

  beforeEach(async () => {
    executionsService = { listAllForOrg: jest.fn() };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [AllExecutionsController],
      providers: [{ provide: ExecutionsService, useValue: executionsService }],
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
      .overrideGuard(OrgContextGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          // Read endpoints are open to any member, including VIEWER.
          const req = ctx.switchToHttp().getRequest<{ org: unknown }>();
          req.org = { id: orgId, role: 'VIEWER' };
          return true;
        },
      })
      .compile();

    app = mod.createNestApplication();
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

  describe('GET /executions', () => {
    it('should return 200 with paginated list scoped to the caller', async () => {
      executionsService.listAllForOrg.mockResolvedValue({
        items: [sampleItem],
        total: 1,
        page: 1,
        pageSize: 20,
        nextCursor: null,
      });

      const res = await request(app.getHttpServer()).get('/executions').expect(200);

      expect(res.body).toEqual({
        items: [sampleItem],
        total: 1,
        page: 1,
        pageSize: 20,
        nextCursor: null,
      });
      expect(executionsService.listAllForOrg).toHaveBeenCalledWith(orgId, expect.any(Object));
    });

    it('should return 401 when no authenticated user', async () => {
      authedUser = null;

      await request(app.getHttpServer()).get('/executions').expect(401);
      expect(executionsService.listAllForOrg).not.toHaveBeenCalled();
    });

    it('should forward status filter to the service', async () => {
      executionsService.listAllForOrg.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      await request(app.getHttpServer()).get('/executions').query({ status: 'FAILED' }).expect(200);

      expect(executionsService.listAllForOrg).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ status: 'FAILED' }),
      );
    });

    it('should reject an invalid status value with 400', async () => {
      await request(app.getHttpServer()).get('/executions').query({ status: 'BOGUS' }).expect(400);
    });

    it('should forward from/to ISO date filters and parse as Date', async () => {
      executionsService.listAllForOrg.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      await request(app.getHttpServer())
        .get('/executions')
        .query({ from: '2026-04-01T00:00:00Z', to: '2026-04-30T23:59:59Z' })
        .expect(200);

      const args = executionsService.listAllForOrg.mock.calls[0][1] as { from?: Date; to?: Date };
      expect(args.from).toBeInstanceOf(Date);
      expect(args.to).toBeInstanceOf(Date);
      expect(args.from?.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    });

    it('should reject invalid date with 400', async () => {
      await request(app.getHttpServer())
        .get('/executions')
        .query({ from: 'not-a-date' })
        .expect(400);
    });

    it('should forward page and pageSize as integers', async () => {
      executionsService.listAllForOrg.mockResolvedValue({
        items: [],
        total: 0,
        page: 2,
        pageSize: 50,
      });

      await request(app.getHttpServer())
        .get('/executions')
        .query({ page: '2', pageSize: '50' })
        .expect(200);

      expect(executionsService.listAllForOrg).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ page: 2, pageSize: 50 }),
      );
    });

    it('should reject pageSize over 100 with 400', async () => {
      await request(app.getHttpServer()).get('/executions').query({ pageSize: '500' }).expect(400);
    });

    it('should reject unknown query params with 400', async () => {
      await request(app.getHttpServer()).get('/executions').query({ userId: 'forged' }).expect(400);
    });

    it('should forward workflowId filter to the service', async () => {
      executionsService.listAllForOrg.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      const wfId = '550e8400-e29b-41d4-a716-446655440000';
      await request(app.getHttpServer()).get('/executions').query({ workflowId: wfId }).expect(200);

      expect(executionsService.listAllForOrg).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ workflowId: wfId }),
      );
    });

    it('should reject a non-UUID workflowId with 400', async () => {
      await request(app.getHttpServer())
        .get('/executions')
        .query({ workflowId: 'not-a-uuid' })
        .expect(400);
      expect(executionsService.listAllForOrg).not.toHaveBeenCalled();
    });

    it('should accept `limit` as an alias for pageSize and forward it as pageSize', async () => {
      executionsService.listAllForOrg.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 5,
      });

      await request(app.getHttpServer()).get('/executions').query({ limit: '5' }).expect(200);

      expect(executionsService.listAllForOrg).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ pageSize: 5 }),
      );
    });

    it('should prefer pageSize when both pageSize and limit are provided', async () => {
      executionsService.listAllForOrg.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 30,
      });

      await request(app.getHttpServer())
        .get('/executions')
        .query({ pageSize: '30', limit: '5' })
        .expect(200);

      expect(executionsService.listAllForOrg).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ pageSize: 30 }),
      );
    });

    it('should reject limit over 100 with 400', async () => {
      await request(app.getHttpServer()).get('/executions').query({ limit: '500' }).expect(400);
      expect(executionsService.listAllForOrg).not.toHaveBeenCalled();
    });

    it('should forward cursor to the service', async () => {
      executionsService.listAllForOrg.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        nextCursor: null,
      });

      const cursor = 'eyJjcmVhdGVkQXQiOiIyMDI2LTA0LTIwVDEwOjAwOjAwLjAwMFoiLCJpZCI6ImFiYyJ9';
      await request(app.getHttpServer()).get('/executions').query({ cursor }).expect(200);

      expect(executionsService.listAllForOrg).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ cursor }),
      );
    });

    it('should reject a cursor with non-base64url characters', async () => {
      await request(app.getHttpServer())
        .get('/executions')
        .query({ cursor: 'invalid cursor!' })
        .expect(400);
      expect(executionsService.listAllForOrg).not.toHaveBeenCalled();
    });

    it('should reject a cursor over 256 characters', async () => {
      await request(app.getHttpServer())
        .get('/executions')
        .query({ cursor: 'a'.repeat(257) })
        .expect(400);
      expect(executionsService.listAllForOrg).not.toHaveBeenCalled();
    });
  });
});
