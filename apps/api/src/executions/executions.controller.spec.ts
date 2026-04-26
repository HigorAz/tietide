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
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';

describe('ExecutionsController (integration)', () => {
  let app: INestApplication;
  let executionsService: { triggerManual: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const workflowId = '550e8400-e29b-41d4-a716-446655440000';
  const executionId = '11111111-1111-4111-8111-111111111111';
  const accepted = {
    id: executionId,
    workflowId,
    status: 'PENDING',
    triggerType: 'manual',
    triggerData: null,
    idempotencyKey: null,
    createdAt: new Date('2026-04-24T00:00:00Z').toISOString(),
  };

  beforeEach(async () => {
    executionsService = { triggerManual: jest.fn() };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [ExecutionsController],
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

  describe('POST /workflows/:id/execute', () => {
    it('should return 202 with the queued execution on success', async () => {
      executionsService.triggerManual.mockResolvedValue(accepted);

      const res = await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/execute`)
        .send({})
        .expect(202);

      expect(res.body).toEqual(accepted);
      expect(executionsService.triggerManual).toHaveBeenCalledWith(
        'owner-uuid',
        workflowId,
        expect.objectContaining({}),
      );
    });

    it('should return 401 when no authenticated user', async () => {
      authedUser = null;

      await request(app.getHttpServer()).post(`/workflows/${workflowId}/execute`).expect(401);
      expect(executionsService.triggerManual).not.toHaveBeenCalled();
    });

    it('should return 400 when the workflow id is not a UUID', async () => {
      await request(app.getHttpServer()).post('/workflows/not-a-uuid/execute').send({}).expect(400);
      expect(executionsService.triggerManual).not.toHaveBeenCalled();
    });

    it('should return 404 when the service throws NotFoundException', async () => {
      executionsService.triggerManual.mockRejectedValue(
        new NotFoundException('Workflow not found'),
      );

      await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/execute`)
        .send({})
        .expect(404);
    });

    it('should return 403 when the service throws ForbiddenException', async () => {
      executionsService.triggerManual.mockRejectedValue(new ForbiddenException('No access'));

      await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/execute`)
        .send({})
        .expect(403);
    });

    it('should forward the Idempotency-Key header to the service', async () => {
      executionsService.triggerManual.mockResolvedValue(accepted);

      await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/execute`)
        .set('Idempotency-Key', 'key-abc')
        .send({})
        .expect(202);

      expect(executionsService.triggerManual).toHaveBeenCalledWith(
        'owner-uuid',
        workflowId,
        expect.objectContaining({ idempotencyKey: 'key-abc' }),
      );
    });

    it('should forward triggerData from the request body to the service', async () => {
      executionsService.triggerManual.mockResolvedValue(accepted);

      await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/execute`)
        .send({ triggerData: { hello: 'world' } })
        .expect(202);

      expect(executionsService.triggerManual).toHaveBeenCalledWith(
        'owner-uuid',
        workflowId,
        expect.objectContaining({ triggerData: { hello: 'world' } }),
      );
    });

    it('should forward the x-request-id header to the service for correlation', async () => {
      executionsService.triggerManual.mockResolvedValue(accepted);

      await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/execute`)
        .set('x-request-id', 'req-corr-1')
        .send({})
        .expect(202);

      expect(executionsService.triggerManual).toHaveBeenCalledWith(
        'owner-uuid',
        workflowId,
        expect.objectContaining({ requestId: 'req-corr-1' }),
      );
    });

    it('should reject unknown body fields with 400', async () => {
      await request(app.getHttpServer())
        .post(`/workflows/${workflowId}/execute`)
        .send({ userId: 'forged' })
        .expect(400);
    });
  });
});
