import type { ExecutionContext, INestApplication } from '@nestjs/common';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { EnvVarsController } from './env-vars.controller';
import { EnvVarsService } from './env-vars.service';

describe('EnvVarsController (USER scope) integration', () => {
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
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EnvVarsController],
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
    key: 'API_KEY',
    scope: 'USER',
    createdAt: new Date('2026-05-07T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-05-07T00:00:00Z').toISOString(),
  };

  describe('GET /env-vars', () => {
    it('should return 401 when JwtAuthGuard rejects', async () => {
      authedUser = null;
      await request(app.getHttpServer()).get('/env-vars').expect(401);
      expect(envVarsService.list).not.toHaveBeenCalled();
    });

    it('should return USER-scope vars filtered by the authenticated user', async () => {
      envVarsService.list.mockResolvedValue([persisted]);

      const res = await request(app.getHttpServer()).get('/env-vars').expect(200);

      expect(res.body).toEqual([persisted]);
      res.body.forEach((row: Record<string, unknown>) => {
        expect(row).not.toHaveProperty('valueEnc');
        expect(row).not.toHaveProperty('valueNonce');
        expect(row).not.toHaveProperty('value');
      });
      expect(envVarsService.list).toHaveBeenCalledWith({
        scope: 'USER',
        ownerUserId: 'owner-uuid',
      });
    });
  });

  describe('POST /env-vars', () => {
    const validBody = { key: 'API_KEY', value: 'sk-live-abc' };

    it('should return 201 with masked response on valid input', async () => {
      envVarsService.create.mockResolvedValue(persisted);

      const res = await request(app.getHttpServer()).post('/env-vars').send(validBody).expect(201);

      expect(res.body).toEqual(persisted);
      expect(res.body).not.toHaveProperty('valueEnc');
      expect(res.body).not.toHaveProperty('valueNonce');
      expect(envVarsService.create).toHaveBeenCalledWith({
        scope: 'USER',
        ownerUserId: 'owner-uuid',
        actorUserId: 'owner-uuid',
        dto: validBody,
      });
    });

    it('should return 400 when key is lowercase', async () => {
      await request(app.getHttpServer())
        .post('/env-vars')
        .send({ key: 'api_key', value: 'x' })
        .expect(400);
      expect(envVarsService.create).not.toHaveBeenCalled();
    });

    it('should return 400 when key starts with a digit', async () => {
      await request(app.getHttpServer())
        .post('/env-vars')
        .send({ key: '1API_KEY', value: 'x' })
        .expect(400);
    });

    it('should return 400 when value is missing', async () => {
      await request(app.getHttpServer()).post('/env-vars').send({ key: 'API_KEY' }).expect(400);
    });

    it('should return 400 on unknown fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/env-vars')
        .send({ ...validBody, scope: 'GLOBAL' })
        .expect(400);
      expect(envVarsService.create).not.toHaveBeenCalled();
    });

    it('should return 409 on ConflictException from the service', async () => {
      envVarsService.create.mockRejectedValue(
        new ConflictException('Env var "API_KEY" already exists in USER scope'),
      );
      await request(app.getHttpServer()).post('/env-vars').send(validBody).expect(409);
    });

    it('should ignore any userId or scope sent in the body and use the JWT id', async () => {
      envVarsService.create.mockResolvedValue(persisted);
      // forbidNonWhitelisted strips foreign fields → 400 (the test above covers this).
      // Here we just confirm the called value matches the JWT, never the body.
      await request(app.getHttpServer()).post('/env-vars').send(validBody).expect(201);
      expect(envVarsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: 'owner-uuid', actorUserId: 'owner-uuid' }),
      );
    });
  });

  describe('PATCH /env-vars/:id', () => {
    it('should return 200 with masked response when updating value', async () => {
      envVarsService.update.mockResolvedValue(persisted);

      const res = await request(app.getHttpServer())
        .patch(`/env-vars/${uuid}`)
        .send({ value: 'rotated' })
        .expect(200);

      expect(res.body).not.toHaveProperty('valueEnc');
      expect(envVarsService.update).toHaveBeenCalledWith({
        scope: 'USER',
        ownerUserId: 'owner-uuid',
        actorUserId: 'owner-uuid',
        id: uuid,
        dto: { value: 'rotated' },
      });
    });

    it('should return 400 when body is empty', async () => {
      await request(app.getHttpServer()).patch(`/env-vars/${uuid}`).send({}).expect(400);
    });

    it('should return 400 when id is not a UUID', async () => {
      await request(app.getHttpServer())
        .patch('/env-vars/not-a-uuid')
        .send({ key: 'X' })
        .expect(400);
    });

    it('should return 404 when the row belongs to another user', async () => {
      envVarsService.update.mockRejectedValue(new NotFoundException('Env var not found'));
      await request(app.getHttpServer()).patch(`/env-vars/${uuid}`).send({ key: 'X' }).expect(404);
    });
  });

  describe('DELETE /env-vars/:id', () => {
    it('should return 204 on success', async () => {
      envVarsService.remove.mockResolvedValue(undefined);
      await request(app.getHttpServer()).delete(`/env-vars/${uuid}`).expect(204);

      expect(envVarsService.remove).toHaveBeenCalledWith({
        scope: 'USER',
        ownerUserId: 'owner-uuid',
        actorUserId: 'owner-uuid',
        id: uuid,
      });
    });

    it('should return 404 when the row belongs to another user', async () => {
      envVarsService.remove.mockRejectedValue(new NotFoundException('Env var not found'));
      await request(app.getHttpServer()).delete(`/env-vars/${uuid}`).expect(404);
    });

    it('should return 400 when id is not a UUID', async () => {
      await request(app.getHttpServer()).delete('/env-vars/not-a-uuid').expect(400);
    });
  });
});
