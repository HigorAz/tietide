import type { ExecutionContext, INestApplication } from '@nestjs/common';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { GlobalExceptionFilter } from '../common/filters/http-exception.filter';
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
    folderId: null,
    createdAt: new Date('2026-04-17T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-04-17T00:00:00Z').toISOString(),
    executionCount: 0,
    tags: [],
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
    app.useGlobalFilters(new GlobalExceptionFilter());
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

    it('should accept an empty definition (workflow is created as a draft)', async () => {
      workflowsService.create.mockResolvedValueOnce({
        ...persisted,
        definition: { nodes: [], edges: [] },
      });

      await request(app.getHttpServer())
        .post('/workflows')
        .send({ name: 'X', definition: { nodes: [], edges: [] } })
        .expect(201);

      expect(workflowsService.create).toHaveBeenCalledWith('owner-uuid', {
        name: 'X',
        definition: { nodes: [], edges: [] },
      });
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

    describe('topology validation (issue #163)', () => {
      function topologyException(
        code: string,
        message: string,
        path: (string | number)[] = ['nodes'],
      ) {
        return new UnprocessableEntityException({
          message: 'Workflow topology is invalid',
          issues: [{ code, path, message }],
        });
      }

      async function assertTopology422(code: string, message: string) {
        workflowsService.create.mockRejectedValue(topologyException(code, message));

        const res = await request(app.getHttpServer())
          .post('/workflows')
          .send(validBody)
          .expect(422);

        expect(res.body.statusCode).toBe(422);
        expect(res.body.code).toBe('UNPROCESSABLE_ENTITY');
        expect(res.body.message).toBe('Workflow topology is invalid');
        expect(Array.isArray(res.body.issues)).toBe(true);
        expect(res.body.issues[0]).toEqual(
          expect.objectContaining({ code, message, path: expect.any(Array) }),
        );
      }

      it('returns 422 with structured issues when the definition has zero triggers', async () => {
        await assertTopology422(
          'no_trigger',
          'Workflow must have exactly one trigger node (in-degree 0), found 0.',
        );
      });

      it('returns 422 with structured issues when the definition has more than one trigger', async () => {
        await assertTopology422(
          'multiple_triggers',
          'Workflow must have exactly one trigger node (in-degree 0), found 2.',
        );
      });

      it('returns 422 with structured issues when the definition contains a cycle', async () => {
        await assertTopology422('cycle', 'Circular dependency detected: A -> B -> A');
      });

      it('returns 422 with structured issues when an edge references a non-existent node id', async () => {
        await assertTopology422('dangling_edge', 'Edge "e1" references unknown node "ghost".');
      });
    });
  });

  describe('GET /workflows', () => {
    it('should return 200 with a paginated envelope of the user rows', async () => {
      workflowsService.list.mockResolvedValue({ items: [persisted], nextCursor: null });

      const res = await request(app.getHttpServer()).get('/workflows').expect(200);

      expect(res.body).toEqual({ items: [persisted], nextCursor: null });
      expect(workflowsService.list).toHaveBeenCalledWith('owner-uuid', {});
    });

    it('passes limit and cursor through to the service filter', async () => {
      workflowsService.list.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/workflows?limit=10&cursor=abc').expect(200);
      expect(workflowsService.list).toHaveBeenCalledWith('owner-uuid', {
        limit: 10,
        cursor: 'abc',
      });
    });

    it('passes folderId="null" sentinel as filter.folderId=null', async () => {
      workflowsService.list.mockResolvedValue([]);
      await request(app.getHttpServer()).get('/workflows?folderId=null').expect(200);
      expect(workflowsService.list).toHaveBeenCalledWith('owner-uuid', { folderId: null });
    });

    it('passes folderId=<uuid> as filter.folderId=<uuid>', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440099';
      workflowsService.list.mockResolvedValue([]);
      await request(app.getHttpServer()).get(`/workflows?folderId=${uuid}`).expect(200);
      expect(workflowsService.list).toHaveBeenCalledWith('owner-uuid', { folderId: uuid });
    });

    it('returns 400 on invalid folderId', async () => {
      await request(app.getHttpServer()).get('/workflows?folderId=not-uuid').expect(400);
    });

    it('parses tagIds CSV into an array', async () => {
      const a = '550e8400-e29b-41d4-a716-446655440011';
      const b = '550e8400-e29b-41d4-a716-446655440012';
      workflowsService.list.mockResolvedValue([]);
      await request(app.getHttpServer()).get(`/workflows?tagIds=${a},${b}`).expect(200);
      expect(workflowsService.list).toHaveBeenCalledWith('owner-uuid', { tagIds: [a, b] });
    });

    it('returns 400 when tagIds contains non-UUID', async () => {
      await request(app.getHttpServer()).get('/workflows?tagIds=not-uuid').expect(400);
    });

    it('should return 401 when the guard rejects', async () => {
      authedUser = null;
      await request(app.getHttpServer()).get('/workflows').expect(401);
    });

    it('should pass through documentation metadata when present (issue #111)', async () => {
      const generatedAt = new Date('2026-05-02T08:30:00Z').toISOString();
      workflowsService.list.mockResolvedValue({
        items: [{ ...persisted, documentation: { generatedAt, version: 2 } }],
        nextCursor: null,
      });

      const res = await request(app.getHttpServer()).get('/workflows').expect(200);

      expect(res.body.items[0].documentation).toEqual({ generatedAt, version: 2 });
    });

    it('should expose documentation as null when no docs exist (issue #111)', async () => {
      workflowsService.list.mockResolvedValue({
        items: [{ ...persisted, documentation: null }],
        nextCursor: null,
      });

      const res = await request(app.getHttpServer()).get('/workflows').expect(200);

      expect(res.body.items[0].documentation).toBeNull();
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

    it('should accept an empty definition on update (workflow reverts to draft)', async () => {
      workflowsService.update.mockResolvedValueOnce({
        ...persisted,
        definition: { nodes: [], edges: [] },
        version: 2,
      });

      await request(app.getHttpServer())
        .patch(`/workflows/${uuid}`)
        .send({ definition: { nodes: [], edges: [] } })
        .expect(200);

      expect(workflowsService.update).toHaveBeenCalledWith('owner-uuid', uuid, {
        definition: { nodes: [], edges: [] },
      });
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

    describe('topology validation (issue #163)', () => {
      function topologyException(
        code: string,
        message: string,
        path: (string | number)[] = ['nodes'],
      ) {
        return new UnprocessableEntityException({
          message: 'Workflow topology is invalid',
          issues: [{ code, path, message }],
        });
      }

      async function assertTopology422(code: string, message: string) {
        workflowsService.update.mockRejectedValue(topologyException(code, message));

        const res = await request(app.getHttpServer())
          .patch(`/workflows/${uuid}`)
          .send({ definition: validDefinition })
          .expect(422);

        expect(res.body.statusCode).toBe(422);
        expect(res.body.code).toBe('UNPROCESSABLE_ENTITY');
        expect(res.body.message).toBe('Workflow topology is invalid');
        expect(Array.isArray(res.body.issues)).toBe(true);
        expect(res.body.issues[0]).toEqual(
          expect.objectContaining({ code, message, path: expect.any(Array) }),
        );
      }

      it('returns 422 with structured issues when the definition has zero triggers', async () => {
        await assertTopology422(
          'no_trigger',
          'Workflow must have exactly one trigger node (in-degree 0), found 0.',
        );
      });

      it('returns 422 with structured issues when the definition has more than one trigger', async () => {
        await assertTopology422(
          'multiple_triggers',
          'Workflow must have exactly one trigger node (in-degree 0), found 2.',
        );
      });

      it('returns 422 with structured issues when the definition contains a cycle', async () => {
        await assertTopology422('cycle', 'Circular dependency detected: A -> B -> A');
      });

      it('returns 422 with structured issues when an edge references a non-existent node id', async () => {
        await assertTopology422('dangling_edge', 'Edge "e1" references unknown node "ghost".');
      });
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
