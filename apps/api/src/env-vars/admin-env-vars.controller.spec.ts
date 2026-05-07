import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminEnvVarsController } from './admin-env-vars.controller';
import { EnvVarsService } from './env-vars.service';

describe('AdminEnvVarsController (GLOBAL scope) integration', () => {
  let app: INestApplication;
  let envVarsService: {
    create: jest.Mock;
    list: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  beforeEach(async () => {
    envVarsService = {
      create: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    authedUser = { id: 'admin-uuid', email: 'admin@example.com', role: 'ADMIN' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminEnvVarsController],
      providers: [{ provide: EnvVarsService, useValue: envVarsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (!authedUser) throw new UnauthorizedException('Missing or invalid token');
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

  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const persisted = {
    id: uuid,
    key: 'API_BASE_URL',
    scope: 'GLOBAL',
    createdAt: new Date('2026-05-07T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-05-07T00:00:00Z').toISOString(),
  };

  describe('RolesGuard enforcement', () => {
    it('should return 401 when no JWT', async () => {
      authedUser = null;
      await request(app.getHttpServer()).get('/admin/env-vars').expect(401);
    });

    it('should return 403 when caller is a USER (not ADMIN)', async () => {
      authedUser = { id: 'u', email: 'u@x', role: 'USER' };
      await request(app.getHttpServer()).get('/admin/env-vars').expect(403);
      expect(envVarsService.list).not.toHaveBeenCalled();
    });

    it('should allow an ADMIN through to the handler', async () => {
      envVarsService.list.mockResolvedValue([]);
      await request(app.getHttpServer()).get('/admin/env-vars').expect(200);
      expect(envVarsService.list).toHaveBeenCalledWith({
        scope: 'GLOBAL',
        ownerUserId: null,
      });
    });
  });

  describe('GET /admin/env-vars', () => {
    it('should return GLOBAL-scope rows masked', async () => {
      envVarsService.list.mockResolvedValue([persisted]);

      const res = await request(app.getHttpServer()).get('/admin/env-vars').expect(200);

      expect(res.body).toEqual([persisted]);
      res.body.forEach((row: Record<string, unknown>) => {
        expect(row).not.toHaveProperty('valueEnc');
        expect(row).not.toHaveProperty('valueNonce');
      });
    });
  });

  describe('POST /admin/env-vars', () => {
    const validBody = { key: 'API_BASE_URL', value: 'https://api.example.com' };

    it('should return 201 and persist with scope=GLOBAL, ownerUserId=null', async () => {
      envVarsService.create.mockResolvedValue(persisted);

      const res = await request(app.getHttpServer())
        .post('/admin/env-vars')
        .send(validBody)
        .expect(201);

      expect(res.body).toEqual(persisted);
      expect(envVarsService.create).toHaveBeenCalledWith({
        scope: 'GLOBAL',
        ownerUserId: null,
        actorUserId: 'admin-uuid',
        dto: validBody,
      });
    });

    it('should return 403 when caller is USER', async () => {
      authedUser = { id: 'u', email: 'u@x', role: 'USER' };
      await request(app.getHttpServer()).post('/admin/env-vars').send(validBody).expect(403);
      expect(envVarsService.create).not.toHaveBeenCalled();
    });

    it('should return 400 on lowercase key', async () => {
      await request(app.getHttpServer())
        .post('/admin/env-vars')
        .send({ key: 'api_base', value: 'x' })
        .expect(400);
    });

    it('should reject unknown body fields', async () => {
      await request(app.getHttpServer())
        .post('/admin/env-vars')
        .send({ ...validBody, ownerUserId: 'forged' })
        .expect(400);
    });
  });

  describe('PATCH /admin/env-vars/:id', () => {
    it('should pass scope=GLOBAL ownerUserId=null actorUserId=admin', async () => {
      envVarsService.update.mockResolvedValue(persisted);
      await request(app.getHttpServer())
        .patch(`/admin/env-vars/${uuid}`)
        .send({ value: 'rotated' })
        .expect(200);

      expect(envVarsService.update).toHaveBeenCalledWith({
        scope: 'GLOBAL',
        ownerUserId: null,
        actorUserId: 'admin-uuid',
        id: uuid,
        dto: { value: 'rotated' },
      });
    });

    it('should return 403 when caller is USER', async () => {
      authedUser = { id: 'u', email: 'u@x', role: 'USER' };
      await request(app.getHttpServer())
        .patch(`/admin/env-vars/${uuid}`)
        .send({ key: 'X' })
        .expect(403);
    });
  });

  describe('DELETE /admin/env-vars/:id', () => {
    it('should return 204 on success', async () => {
      envVarsService.remove.mockResolvedValue(undefined);
      await request(app.getHttpServer()).delete(`/admin/env-vars/${uuid}`).expect(204);

      expect(envVarsService.remove).toHaveBeenCalledWith({
        scope: 'GLOBAL',
        ownerUserId: null,
        actorUserId: 'admin-uuid',
        id: uuid,
      });
    });

    it('should return 403 when caller is USER', async () => {
      authedUser = { id: 'u', email: 'u@x', role: 'USER' };
      await request(app.getHttpServer()).delete(`/admin/env-vars/${uuid}`).expect(403);
    });
  });
});
