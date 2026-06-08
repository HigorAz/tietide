import type { ExecutionContext, INestApplication } from '@nestjs/common';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationInvitesService } from './organization-invites.service';

describe('OrganizationsController (integration)', () => {
  let app: INestApplication;
  let organizations: {
    create: jest.Mock;
    listForUser: jest.Mock;
    findOne: jest.Mock;
    rename: jest.Mock;
    remove: jest.Mock;
  };
  let invites: { accept: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const orgId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    organizations = {
      create: jest.fn(),
      listForUser: jest.fn(),
      findOne: jest.fn(),
      rename: jest.fn(),
      remove: jest.fn(),
    };
    invites = { accept: jest.fn() };
    authedUser = { id: 'user-1', email: 'me@example.com', role: 'USER' };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: organizations },
        { provide: OrganizationInvitesService, useValue: invites },
      ],
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

  describe('POST /organizations', () => {
    it('creates a workspace and returns 201', async () => {
      organizations.create.mockResolvedValue({
        id: orgId,
        name: 'Acme',
        slug: 'acme-1',
        role: 'SUPERADMIN',
      });

      const res = await request(app.getHttpServer())
        .post('/organizations')
        .send({ name: 'Acme' })
        .expect(201);

      expect(res.body.role).toBe('SUPERADMIN');
      expect(organizations.create).toHaveBeenCalledWith('user-1', { name: 'Acme' });
    });

    it('returns 401 without a token', async () => {
      authedUser = null;
      await request(app.getHttpServer()).post('/organizations').send({ name: 'Acme' }).expect(401);
      expect(organizations.create).not.toHaveBeenCalled();
    });

    it('rejects a blank name with 400', async () => {
      await request(app.getHttpServer()).post('/organizations').send({ name: '' }).expect(400);
      expect(organizations.create).not.toHaveBeenCalled();
    });

    it('rejects unknown body fields with 400', async () => {
      await request(app.getHttpServer())
        .post('/organizations')
        .send({ name: 'Acme', slug: 'forged' })
        .expect(400);
    });
  });

  describe('GET /organizations', () => {
    it('lists the caller memberships', async () => {
      organizations.listForUser.mockResolvedValue([
        { id: orgId, name: 'Acme', slug: 'acme-1', role: 'SUPERADMIN' },
      ]);

      const res = await request(app.getHttpServer()).get('/organizations').expect(200);

      expect(res.body).toHaveLength(1);
      expect(organizations.listForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('POST /organizations/invites/accept', () => {
    it('accepts an invite using the caller id and email', async () => {
      invites.accept.mockResolvedValue({
        id: orgId,
        name: 'Acme',
        slug: 'acme-1',
        role: 'MEMBER',
      });

      const res = await request(app.getHttpServer())
        .post('/organizations/invites/accept')
        .send({ token: 'raw-token' })
        .expect(200);

      expect(res.body.role).toBe('MEMBER');
      expect(invites.accept).toHaveBeenCalledWith('user-1', 'me@example.com', {
        token: 'raw-token',
      });
    });

    it('returns 400 when the token is missing', async () => {
      await request(app.getHttpServer()).post('/organizations/invites/accept').send({}).expect(400);
      expect(invites.accept).not.toHaveBeenCalled();
    });

    it('propagates a 400 for an invalid/expired invite', async () => {
      invites.accept.mockRejectedValue(new BadRequestException('This invitation is invalid'));
      await request(app.getHttpServer())
        .post('/organizations/invites/accept')
        .send({ token: 'bad' })
        .expect(400);
    });
  });

  describe('GET /organizations/:id', () => {
    it('returns workspace details', async () => {
      organizations.findOne.mockResolvedValue({
        id: orgId,
        name: 'Acme',
        slug: 'acme-1',
        createdAt: new Date().toISOString(),
      });

      await request(app.getHttpServer()).get(`/organizations/${orgId}`).expect(200);
      expect(organizations.findOne).toHaveBeenCalledWith(orgId, 'user-1');
    });

    it('returns 400 for a non-uuid id', async () => {
      await request(app.getHttpServer()).get('/organizations/not-a-uuid').expect(400);
      expect(organizations.findOne).not.toHaveBeenCalled();
    });

    it('returns 404 when the service throws NotFound (non-member)', async () => {
      organizations.findOne.mockRejectedValue(new NotFoundException('Organization not found'));
      await request(app.getHttpServer()).get(`/organizations/${orgId}`).expect(404);
    });
  });

  describe('PATCH /organizations/:id', () => {
    it('renames the workspace', async () => {
      organizations.rename.mockResolvedValue({
        id: orgId,
        name: 'Renamed',
        slug: 'acme-1',
        createdAt: new Date().toISOString(),
      });

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}`)
        .send({ name: 'Renamed' })
        .expect(200);
      expect(organizations.rename).toHaveBeenCalledWith(orgId, 'user-1', { name: 'Renamed' });
    });

    it('rejects a blank name with 400', async () => {
      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}`)
        .send({ name: '' })
        .expect(400);
    });
  });

  describe('DELETE /organizations/:id', () => {
    it('deletes the workspace and returns 204', async () => {
      organizations.remove.mockResolvedValue(undefined);
      await request(app.getHttpServer()).delete(`/organizations/${orgId}`).expect(204);
      expect(organizations.remove).toHaveBeenCalledWith(orgId, 'user-1');
    });

    it('propagates 400 for the only-workspace guard', async () => {
      organizations.remove.mockRejectedValue(
        new BadRequestException('You cannot delete your only workspace'),
      );
      await request(app.getHttpServer()).delete(`/organizations/${orgId}`).expect(400);
    });
  });
});
