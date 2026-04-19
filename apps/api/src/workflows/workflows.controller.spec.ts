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
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

describe('WorkflowsController (integration)', () => {
  let app: INestApplication;
  let workflowsService: {
    create: jest.Mock;
    list: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const validDefinition = {
    nodes: [
      {
        id: 'n1',
        type: 'manual-trigger',
        name: 'Start',
        position: { x: 0, y: 0 },
        config: {},
      },
    ],
    edges: [],
  };
  const persisted = {
    id: uuid,
    name: 'Demo',
    description: null,
    definition: validDefinition,
    isActive: false,
    version: 1,
    createdAt: new Date('2026-04-17T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-04-17T00:00:00Z').toISOString(),
    executionCount: 0,
  };

  beforeEach(async () => {
    workflowsService = {
      create: jest.fn(),
      list: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [{ provide: WorkflowsService, useValue: workflowsService }],
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

  describe('POST /workflows', () => {
    const validBody = { name: 'Demo', definition: validDefinition };

    it('should return 201 with the created workflow', async () => {
      workflowsService.create.mockResolvedValue(persisted);

      const res = await request(app.getHttpServer()).post('/workflows').send(validBody).expect(201);

      expect(res.body).toEqual(persisted);
      expect(workflowsService.create).toHaveBeenCalledWith('owner-uuid', validBody);
    });

    it('should return 401 when the guard rejects', async () => {
      authedUser = null;

      await request(app.getHttpServer()).post('/workflows').send(validBody).expect(401);
      expect(workflowsService.create).not.toHaveBeenCalled();
    });

    it('should return 400 when name is missing', async () => {
      await request(app.getHttpServer())
        .post('/workflows')
        .send({ definition: validDefinition })
        .expect(400);
    });

    it('should return 400 when definition has empty nodes array', async () => {
      await request(app.getHttpServer())
        .post('/workflows')
        .send({ name: 'X', definition: { nodes: [], edges: [] } })
        .expect(400);
    });

    it('should return 400 when definition node is missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/workflows')
        .send({
          name: 'X',
          definition: { nodes: [{ id: 'n1', type: 'manual-trigger' }], edges: [] },
        })
        .expect(400);
    });

    it('should return 400 when an unknown field is sent', async () => {
      await request(app.getHttpServer())
        .post('/workflows')
        .send({ ...validBody, userId: 'forged', version: 99 })
        .expect(400);
    });

    it('should pass the authenticated user id, never the body id', async () => {
      workflowsService.create.mockResolvedValue(persisted);

      await request(app.getHttpServer()).post('/workflows').send(validBody).expect(201);

      expect(workflowsService.create).toHaveBeenCalledWith('owner-uuid', validBody);
    });
  });

  describe('GET /workflows', () => {
    it('should return 200 with the authenticated user rows', async () => {
      workflowsService.list.mockResolvedValue([persisted]);

      const res = await request(app.getHttpServer()).get('/workflows').expect(200);

      expect(res.body).toEqual([persisted]);
      expect(workflowsService.list).toHaveBeenCalledWith('owner-uuid');
    });

    it('should return 401 when the guard rejects', async () => {
      authedUser = null;
      await request(app.getHttpServer()).get('/workflows').expect(401);
    });
  });

  describe('GET /workflows/:id', () => {
    it('should return 200 on owner', async () => {
      workflowsService.findOne.mockResolvedValue(persisted);

      const res = await request(app.getHttpServer()).get(`/workflows/${uuid}`).expect(200);
      expect(res.body).toEqual(persisted);
    });

    it('should return 404 when service throws NotFoundException', async () => {
      workflowsService.findOne.mockRejectedValue(new NotFoundException('Workflow not found'));
      await request(app.getHttpServer()).get(`/workflows/${uuid}`).expect(404);
    });

    it('should return 403 when service throws ForbiddenException (foreign owner)', async () => {
      workflowsService.findOne.mockRejectedValue(new ForbiddenException('No access'));
      await request(app.getHttpServer()).get(`/workflows/${uuid}`).expect(403);
    });

    it('should return 400 when id is not a UUID', async () => {
      await request(app.getHttpServer()).get('/workflows/not-a-uuid').expect(400);
      expect(workflowsService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /workflows/:id', () => {
    it('should return 200 applying the partial update', async () => {
      workflowsService.update.mockResolvedValue({ ...persisted, version: 2, name: 'Renamed' });

      const res = await request(app.getHttpServer())
        .patch(`/workflows/${uuid}`)
        .send({ name: 'Renamed' })
        .expect(200);

      expect(res.body.version).toBe(2);
      expect(workflowsService.update).toHaveBeenCalledWith('owner-uuid', uuid, { name: 'Renamed' });
    });

    it('should return 400 when definition is invalid (empty nodes)', async () => {
      await request(app.getHttpServer())
        .patch(`/workflows/${uuid}`)
        .send({ definition: { nodes: [], edges: [] } })
        .expect(400);
      expect(workflowsService.update).not.toHaveBeenCalled();
    });

    it('should return 400 when id is not a UUID', async () => {
      await request(app.getHttpServer())
        .patch('/workflows/not-a-uuid')
        .send({ name: 'X' })
        .expect(400);
    });

    it('should return 404 when service throws NotFoundException', async () => {
      workflowsService.update.mockRejectedValue(new NotFoundException('Workflow not found'));
      await request(app.getHttpServer())
        .patch(`/workflows/${uuid}`)
        .send({ name: 'X' })
        .expect(404);
    });

    it('should return 403 when service throws ForbiddenException', async () => {
      workflowsService.update.mockRejectedValue(new ForbiddenException('No access'));
      await request(app.getHttpServer())
        .patch(`/workflows/${uuid}`)
        .send({ name: 'X' })
        .expect(403);
    });
  });

  describe('DELETE /workflows/:id', () => {
    it('should return 204 on success', async () => {
      workflowsService.remove.mockResolvedValue(undefined);
      await request(app.getHttpServer()).delete(`/workflows/${uuid}`).expect(204);
      expect(workflowsService.remove).toHaveBeenCalledWith('owner-uuid', uuid);
    });

    it('should return 404 when service throws NotFoundException', async () => {
      workflowsService.remove.mockRejectedValue(new NotFoundException('Workflow not found'));
      await request(app.getHttpServer()).delete(`/workflows/${uuid}`).expect(404);
    });

    it('should return 403 when service throws ForbiddenException (foreign owner)', async () => {
      workflowsService.remove.mockRejectedValue(new ForbiddenException('No access'));
      await request(app.getHttpServer()).delete(`/workflows/${uuid}`).expect(403);
    });

    it('should return 400 when id is not a UUID', async () => {
      await request(app.getHttpServer()).delete('/workflows/not-a-uuid').expect(400);
    });
  });
});
