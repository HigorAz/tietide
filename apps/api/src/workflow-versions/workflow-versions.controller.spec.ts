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
import { WorkflowVersionsController } from './workflow-versions.controller';
import { WorkflowVersionsService } from './workflow-versions.service';

jest.setTimeout(15000);

describe('WorkflowVersionsController (integration)', () => {
  let app: INestApplication;
  let service: {
    list: jest.Mock;
    getOne: jest.Mock;
    restore: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  const workflowUuid = '550e8400-e29b-41d4-a716-446655440000';
  const baseDefinition = {
    nodes: [
      { id: 'n1', type: 'manual-trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} },
    ],
    edges: [],
  };

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      getOne: jest.fn(),
      restore: jest.fn(),
    };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowVersionsController],
      providers: [{ provide: WorkflowVersionsService, useValue: service }],
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

  describe('GET /workflows/:id/versions', () => {
    it('should return 200 with the list payload', async () => {
      service.list.mockResolvedValue({
        items: [
          {
            id: 'v3',
            version: 3,
            message: 'tweak',
            createdAt: new Date('2026-05-06T10:00:00Z').toISOString(),
            createdBy: { id: 'owner-uuid', email: 'owner@example.com' },
          },
        ],
        nextCursor: null,
      });

      const res = await request(app.getHttpServer())
        .get(`/workflows/${workflowUuid}/versions`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.nextCursor).toBeNull();
      expect(service.list).toHaveBeenCalledWith('owner-uuid', workflowUuid, {
        cursor: undefined,
        limit: undefined,
      });
    });

    it('should pass through cursor and limit query params', async () => {
      service.list.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer())
        .get(`/workflows/${workflowUuid}/versions?limit=5&cursor=abc`)
        .expect(200);

      expect(service.list).toHaveBeenCalledWith('owner-uuid', workflowUuid, {
        cursor: 'abc',
        limit: 5,
      });
    });

    it('should return 401 when unauthenticated', async () => {
      authedUser = null;

      await request(app.getHttpServer()).get(`/workflows/${workflowUuid}/versions`).expect(401);
    });

    it('should return 403 when service throws ForbiddenException (IDOR)', async () => {
      service.list.mockRejectedValue(new ForbiddenException());

      await request(app.getHttpServer()).get(`/workflows/${workflowUuid}/versions`).expect(403);
    });

    it('should return 404 when workflow does not exist', async () => {
      service.list.mockRejectedValue(new NotFoundException());

      await request(app.getHttpServer()).get(`/workflows/${workflowUuid}/versions`).expect(404);
    });

    it('should return 400 for non-uuid id', async () => {
      await request(app.getHttpServer()).get('/workflows/not-a-uuid/versions').expect(400);
    });
  });

  describe('GET /workflows/:id/versions/:version', () => {
    it('should return 200 with the version payload', async () => {
      service.getOne.mockResolvedValue({
        id: 'v2',
        workflowId: workflowUuid,
        version: 2,
        definition: baseDefinition,
        message: null,
        createdAt: new Date('2026-05-06T09:00:00Z').toISOString(),
        createdBy: { id: 'owner-uuid', email: 'owner@example.com' },
      });

      const res = await request(app.getHttpServer())
        .get(`/workflows/${workflowUuid}/versions/2`)
        .expect(200);

      expect(res.body.version).toBe(2);
      expect(res.body.definition).toEqual(baseDefinition);
      expect(service.getOne).toHaveBeenCalledWith('owner-uuid', workflowUuid, 2);
    });

    it('should return 400 when version is not an integer', async () => {
      await request(app.getHttpServer()).get(`/workflows/${workflowUuid}/versions/abc`).expect(400);
    });

    it('should return 404 when service throws NotFoundException', async () => {
      service.getOne.mockRejectedValue(new NotFoundException());

      await request(app.getHttpServer()).get(`/workflows/${workflowUuid}/versions/99`).expect(404);
    });
  });

  describe('POST /workflows/:id/versions/:version/restore', () => {
    it('should return 200 with { version, definition } and not mutate the workflow', async () => {
      service.restore.mockResolvedValue({ version: 2, definition: baseDefinition });

      const res = await request(app.getHttpServer())
        .post(`/workflows/${workflowUuid}/versions/2/restore`)
        .expect(200);

      expect(res.body).toEqual({ version: 2, definition: baseDefinition });
      expect(service.restore).toHaveBeenCalledWith('owner-uuid', workflowUuid, 2);
    });

    it('should return 403 when caller does not own the workflow (IDOR)', async () => {
      service.restore.mockRejectedValue(new ForbiddenException());

      await request(app.getHttpServer())
        .post(`/workflows/${workflowUuid}/versions/2/restore`)
        .expect(403);
    });

    it('should return 404 when version does not exist', async () => {
      service.restore.mockRejectedValue(new NotFoundException());

      await request(app.getHttpServer())
        .post(`/workflows/${workflowUuid}/versions/99/restore`)
        .expect(404);
    });
  });
});
