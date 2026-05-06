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
  };
  let authedUser: { id: string; email: string; role: string } | null;

  beforeEach(async () => {
    connectionsService = {
      list: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
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

    it('should return 200 with metadata-only rows (no encrypted/nonce/refresh fields)', async () => {
      connectionsService.list.mockResolvedValue([persisted]);

      const res = await request(app.getHttpServer()).get('/connections').expect(200);

      expect(res.body).toEqual([persisted]);
      for (const row of res.body as Record<string, unknown>[]) {
        expect(row).not.toHaveProperty('configEncrypted');
        expect(row).not.toHaveProperty('configNonce');
        expect(row).not.toHaveProperty('refreshTokenEncrypted');
        expect(row).not.toHaveProperty('refreshTokenNonce');
      }
      expect(connectionsService.list).toHaveBeenCalledWith('owner-uuid');
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
