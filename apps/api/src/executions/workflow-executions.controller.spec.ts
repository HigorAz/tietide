import type { ExecutionContext, INestApplication } from '@nestjs/common';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WorkflowExecutionsController } from './workflow-executions.controller';
import { ExecutionsService } from './executions.service';

describe('WorkflowExecutionsController (integration)', () => {
  let app: INestApplication;
  let executionsService: { list: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const workflowId = '550e8400-e29b-41d4-a716-446655440000';

  const sampleItem = {
    id: '11111111-1111-4111-8111-111111111111',
    workflowId,
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
    executionsService = { list: jest.fn() };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowExecutionsController],
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

  describe('GET /workflows/:id/executions', () => {
    it('should return 200 with paginated list', async () => {
      executionsService.list.mockResolvedValue({
        items: [sampleItem],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const res = await request(app.getHttpServer())
        .get(`/workflows/${workflowId}/executions`)
        .expect(200);

      expect(res.body).toEqual({
        items: [sampleItem],
        total: 1,
        page: 1,
        pageSize: 20,
      });
      expect(executionsService.list).toHaveBeenCalledWith(
        'owner-uuid',
        workflowId,
        expect.any(Object),
      );
    });

    it('should return 401 when no authenticated user', async () => {
      authedUser = null;

      await request(app.getHttpServer()).get(`/workflows/${workflowId}/executions`).expect(401);
      expect(executionsService.list).not.toHaveBeenCalled();
    });

    it('should return 400 when workflow id is not a UUID', async () => {
      await request(app.getHttpServer()).get('/workflows/not-a-uuid/executions').expect(400);
      expect(executionsService.list).not.toHaveBeenCalled();
    });

    it('should return 404 when service throws NotFoundException', async () => {
      executionsService.list.mockRejectedValue(new NotFoundException('Workflow not found'));

      await request(app.getHttpServer()).get(`/workflows/${workflowId}/executions`).expect(404);
    });

    it('should return 403 when service throws ForbiddenException', async () => {
      executionsService.list.mockRejectedValue(new ForbiddenException('No access'));

      await request(app.getHttpServer()).get(`/workflows/${workflowId}/executions`).expect(403);
    });

    it('should forward status filter to service', async () => {
      executionsService.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

      await request(app.getHttpServer())
        .get(`/workflows/${workflowId}/executions`)
        .query({ status: 'FAILED' })
        .expect(200);

      expect(executionsService.list).toHaveBeenCalledWith(
        'owner-uuid',
        workflowId,
        expect.objectContaining({ status: 'FAILED' }),
      );
    });

    it('should reject an invalid status value with 400', async () => {
      await request(app.getHttpServer())
        .get(`/workflows/${workflowId}/executions`)
        .query({ status: 'BOGUS' })
        .expect(400);
    });

    it('should forward from/to ISO date filters and parse as Date', async () => {
      executionsService.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

      await request(app.getHttpServer())
        .get(`/workflows/${workflowId}/executions`)
        .query({ from: '2026-04-01T00:00:00Z', to: '2026-04-30T23:59:59Z' })
        .expect(200);

      const args = executionsService.list.mock.calls[0][2] as { from?: Date; to?: Date };
      expect(args.from).toBeInstanceOf(Date);
      expect(args.to).toBeInstanceOf(Date);
      expect(args.from?.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    });

    it('should reject invalid date with 400', async () => {
      await request(app.getHttpServer())
        .get(`/workflows/${workflowId}/executions`)
        .query({ from: 'not-a-date' })
        .expect(400);
    });

    it('should forward page and pageSize as integers', async () => {
      executionsService.list.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 50 });

      await request(app.getHttpServer())
        .get(`/workflows/${workflowId}/executions`)
        .query({ page: '2', pageSize: '50' })
        .expect(200);

      expect(executionsService.list).toHaveBeenCalledWith(
        'owner-uuid',
        workflowId,
        expect.objectContaining({ page: 2, pageSize: 50 }),
      );
    });

    it('should reject pageSize over 100 with 400', async () => {
      await request(app.getHttpServer())
        .get(`/workflows/${workflowId}/executions`)
        .query({ pageSize: '500' })
        .expect(400);
    });

    it('should reject unknown query params with 400', async () => {
      await request(app.getHttpServer())
        .get(`/workflows/${workflowId}/executions`)
        .query({ userId: 'forged' })
        .expect(400);
    });
  });
});
