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
import { SecretsController } from './secrets.controller';
import { SecretsService } from './secrets.service';

describe('SecretsController (integration)', () => {
  let app: INestApplication;
  let secretsService: {
    create: jest.Mock;
    list: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  beforeEach(async () => {
    secretsService = {
      create: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SecretsController],
      providers: [{ provide: SecretsService, useValue: secretsService }],
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

  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const persisted = {
    id: uuid,
    name: 'GITHUB_TOKEN',
    createdAt: new Date('2026-04-16T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-04-16T00:00:00Z').toISOString(),
  };

  describe('GET /secrets', () => {
    it('should return 401 when the JwtAuthGuard rejects the request', async () => {
      authedUser = null;

      await request(app.getHttpServer()).get('/secrets').expect(401);
      expect(secretsService.list).not.toHaveBeenCalled();
    });

    it('should return 200 with a list of masked secrets (no value or nonce)', async () => {
      secretsService.list.mockResolvedValue([persisted]);

      const res = await request(app.getHttpServer()).get('/secrets').expect(200);

      expect(res.body).toEqual([persisted]);
      res.body.forEach((row: Record<string, unknown>) => {
        expect(row).not.toHaveProperty('value');
        expect(row).not.toHaveProperty('nonce');
      });
      expect(secretsService.list).toHaveBeenCalledWith('owner-uuid');
    });
  });

  describe('POST /secrets', () => {
    const validBody = { name: 'GITHUB_TOKEN', value: 'gh_abc_123' };

    it('should return 201 and the response without value/nonce on valid input', async () => {
      secretsService.create.mockResolvedValue(persisted);

      const res = await request(app.getHttpServer()).post('/secrets').send(validBody).expect(201);

      expect(res.body).toEqual(persisted);
      expect(res.body).not.toHaveProperty('value');
      expect(res.body).not.toHaveProperty('nonce');
      expect(secretsService.create).toHaveBeenCalledWith('owner-uuid', validBody);
    });

    it('should return 400 when value is missing', async () => {
      await request(app.getHttpServer())
        .post('/secrets')
        .send({ name: 'GITHUB_TOKEN' })
        .expect(400);

      expect(secretsService.create).not.toHaveBeenCalled();
    });

    it('should return 400 when name contains illegal characters (spaces, dots)', async () => {
      await request(app.getHttpServer())
        .post('/secrets')
        .send({ name: 'github.com/token', value: 'x' })
        .expect(400);

      expect(secretsService.create).not.toHaveBeenCalled();
    });

    it('should return 409 when the service throws ConflictException', async () => {
      secretsService.create.mockRejectedValue(
        new ConflictException('Secret with this name already exists'),
      );

      await request(app.getHttpServer()).post('/secrets').send(validBody).expect(409);
    });

    it('should reject unknown fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/secrets')
        .send({ ...validBody, userId: 'forged-uuid' })
        .expect(400);

      expect(secretsService.create).not.toHaveBeenCalled();
    });

    it('should pass the id from the authenticated user, not from the body', async () => {
      secretsService.create.mockResolvedValue(persisted);

      await request(app.getHttpServer()).post('/secrets').send(validBody).expect(201);

      expect(secretsService.create).toHaveBeenCalledWith('owner-uuid', validBody);
    });
  });

  describe('PATCH /secrets/:id', () => {
    it('should return 200 with response excluding value when updating value only', async () => {
      secretsService.update.mockResolvedValue(persisted);

      const res = await request(app.getHttpServer())
        .patch(`/secrets/${uuid}`)
        .send({ value: 'new-plaintext' })
        .expect(200);

      expect(res.body).toEqual(persisted);
      expect(res.body).not.toHaveProperty('value');
      expect(secretsService.update).toHaveBeenCalledWith('owner-uuid', uuid, {
        value: 'new-plaintext',
      });
    });

    it('should return 400 when the body is empty (no name, no value)', async () => {
      await request(app.getHttpServer()).patch(`/secrets/${uuid}`).send({}).expect(400);

      expect(secretsService.update).not.toHaveBeenCalled();
    });

    it('should return 400 when the id is not a UUID', async () => {
      await request(app.getHttpServer())
        .patch('/secrets/not-a-uuid')
        .send({ name: 'NEW' })
        .expect(400);

      expect(secretsService.update).not.toHaveBeenCalled();
    });

    it('should return 404 when the service throws NotFoundException', async () => {
      secretsService.update.mockRejectedValue(new NotFoundException('Secret not found'));

      await request(app.getHttpServer()).patch(`/secrets/${uuid}`).send({ name: 'X' }).expect(404);
    });
  });

  describe('DELETE /secrets/:id', () => {
    it('should return 204 on success', async () => {
      secretsService.remove.mockResolvedValue(undefined);

      await request(app.getHttpServer()).delete(`/secrets/${uuid}`).expect(204);

      expect(secretsService.remove).toHaveBeenCalledWith('owner-uuid', uuid);
    });

    it('should return 404 when the id belongs to another user (ownership filter)', async () => {
      secretsService.remove.mockRejectedValue(new NotFoundException('Secret not found'));

      await request(app.getHttpServer()).delete(`/secrets/${uuid}`).expect(404);
    });

    it('should return 400 when the id is not a UUID', async () => {
      await request(app.getHttpServer()).delete('/secrets/not-a-uuid').expect(400);

      expect(secretsService.remove).not.toHaveBeenCalled();
    });
  });
});
