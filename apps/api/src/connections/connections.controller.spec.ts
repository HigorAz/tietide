import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

describe('ConnectionsController (integration)', () => {
  let app: INestApplication;
  let connectionsService: {
    list: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    create: jest.Mock;
    test: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  beforeEach(async () => {
    connectionsService = {
      list: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      create: jest.fn(),
      test: jest.fn(),
    };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectionsController],
      providers: [{ provide: ConnectionsService, useValue: connectionsService }],
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
    type: ConnectionType.OAUTH2,
    provider: 'slack',
    name: 'Acme workspace',
    status: ConnectionStatus.ACTIVE,
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date('2026-05-06T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-05-06T00:00:00Z').toISOString(),
  };

  describe('GET /connections', () => {
    it('should return 401 when the JwtAuthGuard rejects the request', async () => {
      authedUser = null;

      await request(app.getHttpServer()).get('/connections').expect(401);

      expect(connectionsService.list).not.toHaveBeenCalled();
    });

    it('should return 200 with a paginated envelope of metadata-only rows', async () => {
      connectionsService.list.mockResolvedValue({ items: [persisted], nextCursor: null });

      const res = await request(app.getHttpServer()).get('/connections').expect(200);

      expect(res.body).toEqual({ items: [persisted], nextCursor: null });
      for (const row of res.body.items as Record<string, unknown>[]) {
        expect(row).not.toHaveProperty('configEncrypted');
        expect(row).not.toHaveProperty('configNonce');
        expect(row).not.toHaveProperty('refreshTokenEncrypted');
        expect(row).not.toHaveProperty('refreshTokenNonce');
      }
      expect(connectionsService.list).toHaveBeenCalledWith('owner-uuid', {});
    });
  });

  describe('GET /connections/:id', () => {
    it('should return 200 with metadata-only response', async () => {
      connectionsService.findOne.mockResolvedValue(persisted);

      const res = await request(app.getHttpServer()).get(`/connections/${uuid}`).expect(200);

      expect(res.body).toEqual(persisted);
      expect(res.body).not.toHaveProperty('configEncrypted');
      expect(res.body).not.toHaveProperty('refreshTokenEncrypted');
      expect(connectionsService.findOne).toHaveBeenCalledWith('owner-uuid', uuid);
    });

    it('should return 404 when the connection belongs to another user', async () => {
      connectionsService.findOne.mockRejectedValue(new NotFoundException('Connection not found'));

      await request(app.getHttpServer()).get(`/connections/${uuid}`).expect(404);
    });

    it('should return 400 when the id is not a UUID', async () => {
      await request(app.getHttpServer()).get('/connections/not-a-uuid').expect(400);

      expect(connectionsService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /connections/:id', () => {
    it('should return 200 and pass name + status to the service', async () => {
      connectionsService.update.mockResolvedValue(persisted);

      const res = await request(app.getHttpServer())
        .patch(`/connections/${uuid}`)
        .send({ name: 'Renamed', status: ConnectionStatus.REVOKED })
        .expect(200);

      expect(res.body).toEqual(persisted);
      expect(res.body).not.toHaveProperty('configEncrypted');
      expect(connectionsService.update).toHaveBeenCalledWith('owner-uuid', uuid, {
        name: 'Renamed',
        status: ConnectionStatus.REVOKED,
      });
    });

    it('should return 400 when the body is empty (no name, no status)', async () => {
      await request(app.getHttpServer()).patch(`/connections/${uuid}`).send({}).expect(400);

      expect(connectionsService.update).not.toHaveBeenCalled();
    });

    it('should return 400 when status is not in the enum', async () => {
      await request(app.getHttpServer())
        .patch(`/connections/${uuid}`)
        .send({ status: 'NOT_A_STATUS' })
        .expect(400);

      expect(connectionsService.update).not.toHaveBeenCalled();
    });

    it('should return 400 when the id is not a UUID', async () => {
      await request(app.getHttpServer())
        .patch('/connections/not-a-uuid')
        .send({ name: 'X' })
        .expect(400);

      expect(connectionsService.update).not.toHaveBeenCalled();
    });

    it('should return 404 when the service throws NotFoundException', async () => {
      connectionsService.update.mockRejectedValue(new NotFoundException('Connection not found'));

      await request(app.getHttpServer())
        .patch(`/connections/${uuid}`)
        .send({ name: 'X' })
        .expect(404);
    });

    it('should reject unknown fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .patch(`/connections/${uuid}`)
        .send({ name: 'X', userId: 'forged' })
        .expect(400);

      expect(connectionsService.update).not.toHaveBeenCalled();
    });
  });

  describe('POST /connections', () => {
    const validOpenAiBody = {
      type: ConnectionType.API_KEY,
      provider: 'openai',
      name: 'My OpenAI',
      config: { apiKey: 'sk-abc' },
    };

    it('should return 401 when the JwtAuthGuard rejects the request', async () => {
      authedUser = null;

      await request(app.getHttpServer()).post('/connections').send(validOpenAiBody).expect(401);

      expect(connectionsService.create).not.toHaveBeenCalled();
    });

    it('should return 201 with metadata-only body and forward to ConnectionsService.create', async () => {
      const created = {
        ...persisted,
        type: ConnectionType.API_KEY,
        provider: 'openai',
        name: 'My OpenAI',
      };
      connectionsService.create.mockResolvedValue(created);

      const res = await request(app.getHttpServer())
        .post('/connections')
        .send(validOpenAiBody)
        .expect(201);

      expect(res.body).toEqual(created);
      expect(res.body).not.toHaveProperty('configEncrypted');
      expect(res.body).not.toHaveProperty('configNonce');
      expect(res.body).not.toHaveProperty('refreshTokenEncrypted');
      expect(res.body).not.toHaveProperty('refreshTokenNonce');
      expect(connectionsService.create).toHaveBeenCalledWith('owner-uuid', {
        type: ConnectionType.API_KEY,
        provider: 'openai',
        name: 'My OpenAI',
        config: { apiKey: 'sk-abc' },
      });
    });

    it('should return 201 when type is CUSTOM (e.g. discord-bot)', async () => {
      const discordBotBody = {
        type: ConnectionType.CUSTOM,
        provider: 'discord-bot',
        name: 'My Discord Bot',
        config: {
          applicationId: '123456789012345678',
          publicKey: 'a1b2c3d4'.repeat(8),
          botToken: 'fake-bot-token',
        },
      };
      const created = {
        ...persisted,
        type: ConnectionType.CUSTOM,
        provider: 'discord-bot',
        name: 'My Discord Bot',
      };
      connectionsService.create.mockResolvedValue(created);

      await request(app.getHttpServer()).post('/connections').send(discordBotBody).expect(201);

      expect(connectionsService.create).toHaveBeenCalledWith(
        'owner-uuid',
        expect.objectContaining({ type: ConnectionType.CUSTOM, provider: 'discord-bot' }),
      );
    });

    it('should return 400 when type is OAUTH2 (must use OAuth flow)', async () => {
      await request(app.getHttpServer())
        .post('/connections')
        .send({ ...validOpenAiBody, type: ConnectionType.OAUTH2 })
        .expect(400);

      expect(connectionsService.create).not.toHaveBeenCalled();
    });

    it('should return 400 when provider is unknown', async () => {
      await request(app.getHttpServer())
        .post('/connections')
        .send({ ...validOpenAiBody, provider: 'unknown-provider' })
        .expect(400);

      expect(connectionsService.create).not.toHaveBeenCalled();
    });

    it('should return 400 when config fails the per-provider schema (openai missing apiKey)', async () => {
      await request(app.getHttpServer())
        .post('/connections')
        .send({ ...validOpenAiBody, config: {} })
        .expect(400);

      expect(connectionsService.create).not.toHaveBeenCalled();
    });

    it('should return 400 when name is empty', async () => {
      await request(app.getHttpServer())
        .post('/connections')
        .send({ ...validOpenAiBody, name: '' })
        .expect(400);

      expect(connectionsService.create).not.toHaveBeenCalled();
    });

    it('should reject unknown body fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/connections')
        .send({ ...validOpenAiBody, userId: 'forged' })
        .expect(400);

      expect(connectionsService.create).not.toHaveBeenCalled();
    });

    it('should accept the optional organization field on openai config', async () => {
      const created = {
        ...persisted,
        type: ConnectionType.API_KEY,
        provider: 'openai',
        name: 'My OpenAI',
      };
      connectionsService.create.mockResolvedValue(created);

      await request(app.getHttpServer())
        .post('/connections')
        .send({
          ...validOpenAiBody,
          config: { apiKey: 'sk-abc', organization: 'org-1' },
        })
        .expect(201);

      expect(connectionsService.create).toHaveBeenCalledWith(
        'owner-uuid',
        expect.objectContaining({
          config: { apiKey: 'sk-abc', organization: 'org-1' },
        }),
      );
    });

    it('should accept anthropic API key config', async () => {
      const created = {
        ...persisted,
        type: ConnectionType.API_KEY,
        provider: 'anthropic',
        name: 'My Anthropic',
      };
      connectionsService.create.mockResolvedValue(created);

      await request(app.getHttpServer())
        .post('/connections')
        .send({
          type: ConnectionType.API_KEY,
          provider: 'anthropic',
          name: 'My Anthropic',
          config: { apiKey: 'sk-ant-abc' },
        })
        .expect(201);
    });
  });

  describe('POST /connections/:id/test', () => {
    it('should return 401 when the JwtAuthGuard rejects the request', async () => {
      authedUser = null;

      await request(app.getHttpServer()).post(`/connections/${uuid}/test`).expect(401);

      expect(connectionsService.test).not.toHaveBeenCalled();
    });

    it('should return 200 with { ok, latencyMs } on success', async () => {
      connectionsService.test.mockResolvedValue({ ok: true, latencyMs: 142 });

      const res = await request(app.getHttpServer()).post(`/connections/${uuid}/test`).expect(200);

      expect(res.body).toEqual({ ok: true, latencyMs: 142 });
      expect(connectionsService.test).toHaveBeenCalledWith('owner-uuid', uuid);
    });

    it('should return 200 with { ok: false, message, latencyMs } on failed health check', async () => {
      connectionsService.test.mockResolvedValue({
        ok: false,
        message: '401 Invalid API key',
        latencyMs: 80,
      });

      const res = await request(app.getHttpServer()).post(`/connections/${uuid}/test`).expect(200);

      expect(res.body).toEqual({ ok: false, message: '401 Invalid API key', latencyMs: 80 });
    });

    it('should return 404 when the connection belongs to another user (IDOR)', async () => {
      connectionsService.test.mockRejectedValue(new NotFoundException('Connection not found'));

      await request(app.getHttpServer()).post(`/connections/${uuid}/test`).expect(404);
    });

    it('should return 400 when the id is not a UUID', async () => {
      await request(app.getHttpServer()).post('/connections/not-a-uuid/test').expect(400);

      expect(connectionsService.test).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /connections/:id', () => {
    it('should return 204 on success', async () => {
      connectionsService.remove.mockResolvedValue(undefined);

      await request(app.getHttpServer()).delete(`/connections/${uuid}`).expect(204);

      expect(connectionsService.remove).toHaveBeenCalledWith('owner-uuid', uuid);
    });

    it('should return 404 when the connection belongs to another user (ownership filter)', async () => {
      connectionsService.remove.mockRejectedValue(new NotFoundException('Connection not found'));

      await request(app.getHttpServer()).delete(`/connections/${uuid}`).expect(404);
    });

    it('should return 400 when the id is not a UUID', async () => {
      await request(app.getHttpServer()).delete('/connections/not-a-uuid').expect(400);

      expect(connectionsService.remove).not.toHaveBeenCalled();
    });
  });
});
