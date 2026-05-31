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
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';

jest.setTimeout(15000);

describe('FoldersController (integration)', () => {
  let app: INestApplication;
  let foldersService: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  beforeEach(async () => {
    foldersService = {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FoldersController],
      providers: [{ provide: FoldersService, useValue: foldersService }],
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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const parentUuid = '550e8400-e29b-41d4-a716-446655440001';
  const persisted = {
    id: uuid,
    name: 'Personal',
    parentFolderId: null,
    createdAt: new Date('2026-05-08T00:00:00Z').toISOString(),
  };

  describe('GET /folders', () => {
    it('returns 401 when guard rejects', async () => {
      authedUser = null;
      await request(app.getHttpServer()).get('/folders').expect(401);
      expect(foldersService.list).not.toHaveBeenCalled();
    });

    it('returns 200 with a paginated envelope of the user folders', async () => {
      foldersService.list.mockResolvedValue({ items: [persisted], nextCursor: null });
      const res = await request(app.getHttpServer()).get('/folders').expect(200);
      expect(res.body).toEqual({ items: [persisted], nextCursor: null });
      expect(foldersService.list).toHaveBeenCalledWith('owner-uuid', {});
    });
  });

  describe('POST /folders', () => {
    it('returns 201 on valid body', async () => {
      foldersService.create.mockResolvedValue(persisted);
      const res = await request(app.getHttpServer())
        .post('/folders')
        .send({ name: 'Personal' })
        .expect(201);
      expect(res.body).toEqual(persisted);
      expect(foldersService.create).toHaveBeenCalledWith('owner-uuid', { name: 'Personal' });
    });

    it('accepts a UUID parentFolderId', async () => {
      foldersService.create.mockResolvedValue({ ...persisted, parentFolderId: parentUuid });
      await request(app.getHttpServer())
        .post('/folders')
        .send({ name: 'Sub', parentFolderId: parentUuid })
        .expect(201);
      expect(foldersService.create).toHaveBeenCalledWith('owner-uuid', {
        name: 'Sub',
        parentFolderId: parentUuid,
      });
    });

    it('returns 400 when name is empty', async () => {
      await request(app.getHttpServer()).post('/folders').send({ name: '' }).expect(400);
      expect(foldersService.create).not.toHaveBeenCalled();
    });

    it('returns 400 when parentFolderId is not a UUID', async () => {
      await request(app.getHttpServer())
        .post('/folders')
        .send({ name: 'Sub', parentFolderId: 'not-a-uuid' })
        .expect(400);
      expect(foldersService.create).not.toHaveBeenCalled();
    });

    it('returns 404 when service throws NotFoundException for missing parent', async () => {
      foldersService.create.mockRejectedValue(new NotFoundException('Folder not found'));
      await request(app.getHttpServer())
        .post('/folders')
        .send({ name: 'Sub', parentFolderId: parentUuid })
        .expect(404);
    });
  });

  describe('PATCH /folders/:id', () => {
    it('renames a folder', async () => {
      foldersService.update.mockResolvedValue({ ...persisted, name: 'Renamed' });
      await request(app.getHttpServer())
        .patch(`/folders/${uuid}`)
        .send({ name: 'Renamed' })
        .expect(200);
      expect(foldersService.update).toHaveBeenCalledWith('owner-uuid', uuid, { name: 'Renamed' });
    });

    it('moves a folder to root via parentFolderId=null', async () => {
      foldersService.update.mockResolvedValue(persisted);
      await request(app.getHttpServer())
        .patch(`/folders/${uuid}`)
        .send({ parentFolderId: null })
        .expect(200);
      expect(foldersService.update).toHaveBeenCalledWith('owner-uuid', uuid, {
        parentFolderId: null,
      });
    });

    it('returns 400 on cycle BadRequestException', async () => {
      foldersService.update.mockRejectedValue(
        new BadRequestException('Cannot move a folder into its own descendant'),
      );
      await request(app.getHttpServer())
        .patch(`/folders/${uuid}`)
        .send({ parentFolderId: parentUuid })
        .expect(400);
    });

    it('returns 404 when folder belongs to another user', async () => {
      foldersService.update.mockRejectedValue(new NotFoundException('Folder not found'));
      await request(app.getHttpServer()).patch(`/folders/${uuid}`).send({ name: 'X' }).expect(404);
    });
  });

  describe('DELETE /folders/:id', () => {
    it('returns 200 with cascade counts on success', async () => {
      foldersService.remove.mockResolvedValue({ deletedFolders: 2, deletedWorkflows: 5 });
      const res = await request(app.getHttpServer()).delete(`/folders/${uuid}`).expect(200);
      expect(res.body).toEqual({ deletedFolders: 2, deletedWorkflows: 5 });
      expect(foldersService.remove).toHaveBeenCalledWith('owner-uuid', uuid);
    });

    it('returns 404 when folder belongs to another user', async () => {
      foldersService.remove.mockRejectedValue(new NotFoundException('Folder not found'));
      await request(app.getHttpServer()).delete(`/folders/${uuid}`).expect(404);
    });

    it('returns 400 on invalid UUID', async () => {
      await request(app.getHttpServer()).delete('/folders/not-a-uuid').expect(400);
      expect(foldersService.remove).not.toHaveBeenCalled();
    });
  });
});
