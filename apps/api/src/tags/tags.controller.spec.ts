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
import { OrgContextGuard } from '../common/guards/org-context.guard';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

jest.setTimeout(15000);

describe('TagsController (integration)', () => {
  let app: INestApplication;
  let tagsService: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  beforeEach(async () => {
    tagsService = {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagsController],
      providers: [{ provide: TagsService, useValue: tagsService }],
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
      .overrideGuard(OrgContextGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest<{ org: unknown }>();
          req.org = { id: 'org-uuid', role: 'SUPERADMIN' };
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
    name: 'client-a',
    color: '#3366cc',
    createdAt: new Date('2026-05-08T00:00:00Z').toISOString(),
  };

  describe('GET /tags', () => {
    it('returns 401 when guard rejects', async () => {
      authedUser = null;
      await request(app.getHttpServer()).get('/tags').expect(401);
    });

    it('returns 200 with a paginated envelope of the user tags', async () => {
      tagsService.list.mockResolvedValue({ items: [persisted], nextCursor: null });
      const res = await request(app.getHttpServer()).get('/tags').expect(200);
      expect(res.body).toEqual({ items: [persisted], nextCursor: null });
      expect(tagsService.list).toHaveBeenCalledWith('org-uuid', {});
    });
  });

  describe('POST /tags', () => {
    it('returns 201 on valid body', async () => {
      tagsService.create.mockResolvedValue(persisted);
      const res = await request(app.getHttpServer())
        .post('/tags')
        .send({ name: 'client-a', color: '#3366cc' })
        .expect(201);
      expect(res.body).toEqual(persisted);
    });

    it('accepts a tag without color', async () => {
      tagsService.create.mockResolvedValue({ ...persisted, color: null });
      await request(app.getHttpServer()).post('/tags').send({ name: 'draft' }).expect(201);
      expect(tagsService.create).toHaveBeenCalledWith('org-uuid', 'owner-uuid', { name: 'draft' });
    });

    it('returns 400 on invalid color', async () => {
      await request(app.getHttpServer())
        .post('/tags')
        .send({ name: 'x', color: 'red' })
        .expect(400);
    });

    it('returns 400 on empty name', async () => {
      await request(app.getHttpServer()).post('/tags').send({ name: '' }).expect(400);
    });

    it('returns 409 on duplicate name', async () => {
      tagsService.create.mockRejectedValue(new ConflictException('Tag exists'));
      await request(app.getHttpServer()).post('/tags').send({ name: 'dup' }).expect(409);
    });
  });

  describe('PATCH /tags/:id', () => {
    it('returns 200 on rename', async () => {
      tagsService.update.mockResolvedValue({ ...persisted, name: 'renamed' });
      await request(app.getHttpServer())
        .patch(`/tags/${uuid}`)
        .send({ name: 'renamed' })
        .expect(200);
    });

    it('returns 400 when no fields provided', async () => {
      await request(app.getHttpServer()).patch(`/tags/${uuid}`).send({}).expect(400);
      expect(tagsService.update).not.toHaveBeenCalled();
    });

    it('returns 404 when not found', async () => {
      tagsService.update.mockRejectedValue(new NotFoundException('Tag not found'));
      await request(app.getHttpServer()).patch(`/tags/${uuid}`).send({ name: 'x' }).expect(404);
    });
  });

  describe('DELETE /tags/:id', () => {
    it('returns 204 on success', async () => {
      tagsService.remove.mockResolvedValue(undefined);
      await request(app.getHttpServer()).delete(`/tags/${uuid}`).expect(204);
      expect(tagsService.remove).toHaveBeenCalledWith('org-uuid', 'owner-uuid', uuid);
    });

    it('returns 404 when not found', async () => {
      tagsService.remove.mockRejectedValue(new NotFoundException('Tag not found'));
      await request(app.getHttpServer()).delete(`/tags/${uuid}`).expect(404);
    });
  });
});
