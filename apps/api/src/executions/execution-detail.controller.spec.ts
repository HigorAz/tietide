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
import { ExecutionDetailController } from './execution-detail.controller';
import { ExecutionsService } from './executions.service';

describe('ExecutionDetailController (integration)', () => {
  let app: INestApplication;
  let executionsService: { findOne: jest.Mock; listSteps: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const executionId = '11111111-1111-4111-8111-111111111111';
  const workflowId = '550e8400-e29b-41d4-a716-446655440000';

  const detail = {
    id: executionId,
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

  const sampleStep = {
    id: 'step-1',
    executionId,
    nodeId: 'node-1',
    nodeType: 'http',
    nodeName: 'HTTP Call',
    status: 'SUCCESS',
    inputData: { url: 'https://x' },
    outputData: { ok: true },
    error: null,
    startedAt: '2026-04-20T10:00:01.000Z',
    finishedAt: '2026-04-20T10:00:02.000Z',
    durationMs: 1000,
  };

  beforeEach(async () => {
    executionsService = { findOne: jest.fn(), listSteps: jest.fn() };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [ExecutionDetailController],
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

  describe('GET /executions/:id', () => {
    it('should return 200 with execution detail for the owner', async () => {
      executionsService.findOne.mockResolvedValue(detail);

      const res = await request(app.getHttpServer()).get(`/executions/${executionId}`).expect(200);

      expect(res.body).toEqual(detail);
      expect(executionsService.findOne).toHaveBeenCalledWith('owner-uuid', executionId);
    });

    it('should return 401 when no authenticated user', async () => {
      authedUser = null;

      await request(app.getHttpServer()).get(`/executions/${executionId}`).expect(401);
      expect(executionsService.findOne).not.toHaveBeenCalled();
    });

    it('should return 400 when execution id is not a UUID', async () => {
      await request(app.getHttpServer()).get('/executions/not-a-uuid').expect(400);
      expect(executionsService.findOne).not.toHaveBeenCalled();
    });

    it('should return 404 when service throws NotFoundException', async () => {
      executionsService.findOne.mockRejectedValue(new NotFoundException('Execution not found'));

      await request(app.getHttpServer()).get(`/executions/${executionId}`).expect(404);
    });

    it('should return 403 when service throws ForbiddenException', async () => {
      executionsService.findOne.mockRejectedValue(new ForbiddenException('No access'));

      await request(app.getHttpServer()).get(`/executions/${executionId}`).expect(403);
    });
  });

  describe('GET /executions/:id/steps', () => {
    it('should return 200 with steps array for the owner', async () => {
      executionsService.listSteps.mockResolvedValue([sampleStep]);

      const res = await request(app.getHttpServer())
        .get(`/executions/${executionId}/steps`)
        .expect(200);

      expect(res.body).toEqual([sampleStep]);
      expect(executionsService.listSteps).toHaveBeenCalledWith('owner-uuid', executionId);
    });

    it('should return 401 when no authenticated user', async () => {
      authedUser = null;

      await request(app.getHttpServer()).get(`/executions/${executionId}/steps`).expect(401);
      expect(executionsService.listSteps).not.toHaveBeenCalled();
    });

    it('should return 400 when execution id is not a UUID', async () => {
      await request(app.getHttpServer()).get('/executions/not-a-uuid/steps').expect(400);
      expect(executionsService.listSteps).not.toHaveBeenCalled();
    });

    it('should return 404 when service throws NotFoundException', async () => {
      executionsService.listSteps.mockRejectedValue(new NotFoundException('Execution not found'));

      await request(app.getHttpServer()).get(`/executions/${executionId}/steps`).expect(404);
    });

    it('should return 403 when service throws ForbiddenException', async () => {
      executionsService.listSteps.mockRejectedValue(new ForbiddenException('No access'));

      await request(app.getHttpServer()).get(`/executions/${executionId}/steps`).expect(403);
    });
  });
});
