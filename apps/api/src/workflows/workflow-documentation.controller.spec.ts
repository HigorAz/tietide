import type { ExecutionContext, INestApplication } from '@nestjs/common';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WorkflowDocumentationController } from './workflow-documentation.controller';
import { WorkflowDocumentationService } from './workflow-documentation.service';

describe('WorkflowDocumentationController (integration)', () => {
  let app: INestApplication;
  let docs: { generate: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const result = {
    workflowId: uuid,
    version: 3,
    documentation: '# Demo\nGenerated text',
    sections: {
      objective: 'obj',
      triggers: 'trig',
      actions: 'act',
      dataFlow: 'flow',
      decisions: 'dec',
    },
    model: 'llama3.1:8b',
    cached: false,
    generatedAt: new Date('2026-04-26T01:00:00Z').toISOString(),
  };

  beforeEach(async () => {
    docs = { generate: jest.fn() };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowDocumentationController],
      providers: [{ provide: WorkflowDocumentationService, useValue: docs }],
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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /workflows/:id/generate-docs', () => {
    it('should return 200 with the generated documentation on success', async () => {
      docs.generate.mockResolvedValue(result);

      const res = await request(app.getHttpServer())
        .post(`/workflows/${uuid}/generate-docs`)
        .expect(200);

      expect(res.body).toEqual(result);
      expect(docs.generate).toHaveBeenCalledWith('owner-uuid', uuid);
    });

    it('should return 401 when the guard rejects', async () => {
      authedUser = null;
      await request(app.getHttpServer()).post(`/workflows/${uuid}/generate-docs`).expect(401);
      expect(docs.generate).not.toHaveBeenCalled();
    });

    it('should return 400 when id is not a UUID', async () => {
      await request(app.getHttpServer()).post('/workflows/not-a-uuid/generate-docs').expect(400);
      expect(docs.generate).not.toHaveBeenCalled();
    });

    it('should return 404 when service throws NotFoundException', async () => {
      docs.generate.mockRejectedValue(new NotFoundException('Workflow not found'));
      await request(app.getHttpServer()).post(`/workflows/${uuid}/generate-docs`).expect(404);
    });

    it('should return 403 when service throws ForbiddenException', async () => {
      docs.generate.mockRejectedValue(new ForbiddenException('No access'));
      await request(app.getHttpServer()).post(`/workflows/${uuid}/generate-docs`).expect(403);
    });

    it('should return 503 when AI service is unavailable', async () => {
      docs.generate.mockRejectedValue(new ServiceUnavailableException('AI service unavailable'));
      const res = await request(app.getHttpServer())
        .post(`/workflows/${uuid}/generate-docs`)
        .expect(503);
      expect(res.body.message ?? res.body.error).toBeDefined();
    });
  });
});
