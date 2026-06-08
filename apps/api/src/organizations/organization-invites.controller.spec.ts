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
import { OrganizationInvitesController } from './organization-invites.controller';
import { OrganizationInvitesService } from './organization-invites.service';

describe('OrganizationInvitesController (integration)', () => {
  let app: INestApplication;
  let invites: { create: jest.Mock; list: jest.Mock; revoke: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const orgId = '550e8400-e29b-41d4-a716-446655440000';
  const inviteId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    invites = { create: jest.fn(), list: jest.fn(), revoke: jest.fn() };
    authedUser = { id: 'user-1', email: 'me@example.com', role: 'USER' };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationInvitesController],
      providers: [{ provide: OrganizationInvitesService, useValue: invites }],
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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /organizations/:id/invites', () => {
    it('creates an invite and returns 201', async () => {
      invites.create.mockResolvedValue({
        id: inviteId,
        email: 'new@x.com',
        role: 'MEMBER',
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invites`)
        .send({ email: 'new@x.com', role: 'MEMBER' })
        .expect(201);

      expect(res.body).not.toHaveProperty('tokenHash');
      expect(invites.create).toHaveBeenCalledWith(orgId, 'user-1', {
        email: 'new@x.com',
        role: 'MEMBER',
      });
    });

    it('returns 401 without a token', async () => {
      authedUser = null;
      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invites`)
        .send({ email: 'new@x.com', role: 'MEMBER' })
        .expect(401);
    });

    it('rejects a bad email with 400', async () => {
      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invites`)
        .send({ email: 'not-an-email', role: 'MEMBER' })
        .expect(400);
      expect(invites.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid role with 400', async () => {
      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invites`)
        .send({ email: 'new@x.com', role: 'GOD' })
        .expect(400);
    });

    it('propagates 403 when an ADMIN invites at SUPERADMIN role', async () => {
      invites.create.mockRejectedValue(new ForbiddenException('nope'));
      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invites`)
        .send({ email: 'new@x.com', role: 'SUPERADMIN' })
        .expect(403);
    });
  });

  describe('GET /organizations/:id/invites', () => {
    it('lists pending invites', async () => {
      invites.list.mockResolvedValue([]);
      await request(app.getHttpServer()).get(`/organizations/${orgId}/invites`).expect(200);
      expect(invites.list).toHaveBeenCalledWith(orgId, 'user-1');
    });

    it('propagates 403 for a non-manager', async () => {
      invites.list.mockRejectedValue(new ForbiddenException('nope'));
      await request(app.getHttpServer()).get(`/organizations/${orgId}/invites`).expect(403);
    });
  });

  describe('DELETE /organizations/:id/invites/:inviteId', () => {
    it('revokes an invite and returns 204', async () => {
      invites.revoke.mockResolvedValue(undefined);
      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/invites/${inviteId}`)
        .expect(204);
      expect(invites.revoke).toHaveBeenCalledWith(orgId, 'user-1', inviteId);
    });

    it('returns 404 when the invite is missing', async () => {
      invites.revoke.mockRejectedValue(new NotFoundException('Invite not found'));
      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/invites/${inviteId}`)
        .expect(404);
    });
  });
});
