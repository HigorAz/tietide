import type { ExecutionContext, INestApplication } from '@nestjs/common';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationMembersController } from './organization-members.controller';
import { OrganizationsService } from './organizations.service';

describe('OrganizationMembersController (integration)', () => {
  let app: INestApplication;
  let organizations: {
    listMembers: jest.Mock;
    changeMemberRole: jest.Mock;
    removeMember: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  const orgId = '550e8400-e29b-41d4-a716-446655440000';
  const targetUserId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    organizations = {
      listMembers: jest.fn(),
      changeMemberRole: jest.fn(),
      removeMember: jest.fn(),
    };
    authedUser = { id: 'user-1', email: 'me@example.com', role: 'USER' };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationMembersController],
      providers: [{ provide: OrganizationsService, useValue: organizations }],
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

  describe('GET /organizations/:id/members', () => {
    it('lists members', async () => {
      organizations.listMembers.mockResolvedValue([
        {
          userId: targetUserId,
          email: 'a@x.com',
          name: 'Ada',
          role: 'MEMBER',
          createdAt: new Date().toISOString(),
        },
      ]);

      await request(app.getHttpServer()).get(`/organizations/${orgId}/members`).expect(200);
      expect(organizations.listMembers).toHaveBeenCalledWith(orgId, 'user-1');
    });

    it('returns 401 without a token', async () => {
      authedUser = null;
      await request(app.getHttpServer()).get(`/organizations/${orgId}/members`).expect(401);
    });

    it('returns 404 for a non-member (service NotFound)', async () => {
      organizations.listMembers.mockRejectedValue(new NotFoundException('Organization not found'));
      await request(app.getHttpServer()).get(`/organizations/${orgId}/members`).expect(404);
    });
  });

  describe('PATCH /organizations/:id/members/:userId', () => {
    it('changes a member role', async () => {
      organizations.changeMemberRole.mockResolvedValue({
        userId: targetUserId,
        email: 'a@x.com',
        name: 'Ada',
        role: 'ADMIN',
        createdAt: new Date().toISOString(),
      });

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${targetUserId}`)
        .send({ role: 'ADMIN' })
        .expect(200);
      expect(organizations.changeMemberRole).toHaveBeenCalledWith(orgId, 'user-1', targetUserId, {
        role: 'ADMIN',
      });
    });

    it('rejects an invalid role with 400', async () => {
      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${targetUserId}`)
        .send({ role: 'GOD' })
        .expect(400);
      expect(organizations.changeMemberRole).not.toHaveBeenCalled();
    });

    it('propagates 403 for insufficient role', async () => {
      organizations.changeMemberRole.mockRejectedValue(new ForbiddenException('nope'));
      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${targetUserId}`)
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('propagates 400 for the last-SUPERADMIN invariant', async () => {
      organizations.changeMemberRole.mockRejectedValue(
        new BadRequestException('An organization must keep at least one SUPERADMIN'),
      );
      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${targetUserId}`)
        .send({ role: 'ADMIN' })
        .expect(400);
    });
  });

  describe('DELETE /organizations/:id/members/:userId', () => {
    it('removes a member and returns 204', async () => {
      organizations.removeMember.mockResolvedValue(undefined);
      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${targetUserId}`)
        .expect(204);
      expect(organizations.removeMember).toHaveBeenCalledWith(orgId, 'user-1', targetUserId);
    });

    it('propagates 403 when an ADMIN tries to remove a SUPERADMIN', async () => {
      organizations.removeMember.mockRejectedValue(new ForbiddenException('nope'));
      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${targetUserId}`)
        .expect(403);
    });
  });
});
