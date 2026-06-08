import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { FoldersService } from './folders.service';

describe('FoldersService', () => {
  let service: FoldersService;
  let prisma: {
    folder: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    workflow: {
      count: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };

  const orgId = 'org-uuid-1';
  const otherOrgId = 'org-uuid-2';
  const userId = 'user-uuid-1';
  const folderId = 'folder-uuid-1';
  const childId = 'folder-uuid-child';

  beforeEach(async () => {
    prisma = {
      folder: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      workflow: {
        count: jest.fn(),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoldersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: audit },
      ],
    }).compile();

    service = module.get<FoldersService>(FoldersService);
    jest.clearAllMocks();
  });

  const persistedFolder = {
    id: folderId,
    name: 'Personal',
    parentFolderId: null,
    createdAt: new Date('2026-05-08T00:00:00Z'),
  };

  describe('create', () => {
    it('persists with organizationId, userId, name, and parentFolderId=null when not provided', async () => {
      prisma.folder.create.mockResolvedValue(persistedFolder);

      await service.create(orgId, userId, { name: 'Personal' });

      expect(prisma.folder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { organizationId: orgId, userId, name: 'Personal', parentFolderId: null },
        }),
      );
    });

    it('returns SAFE_SELECT shape — no userId/organizationId leaked', async () => {
      prisma.folder.create.mockResolvedValue(persistedFolder);

      const result = await service.create(orgId, userId, { name: 'Personal' });

      expect(result).toEqual(persistedFolder);
      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('organizationId');
    });

    it('rejects with NotFoundException when parentFolderId belongs to another organization', async () => {
      prisma.folder.findFirst.mockResolvedValue(null);

      await expect(
        service.create(orgId, userId, { name: 'Sub', parentFolderId: 'other-org-folder' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.folder.create).not.toHaveBeenCalled();
    });

    it('persists with valid parentFolderId when parent belongs to the org', async () => {
      prisma.folder.findFirst.mockResolvedValue({ id: folderId });
      prisma.folder.create.mockResolvedValue({ ...persistedFolder, parentFolderId: folderId });

      await service.create(orgId, userId, { name: 'Child', parentFolderId: folderId });

      expect(prisma.folder.findFirst).toHaveBeenCalledWith({
        where: { id: folderId, organizationId: orgId },
        select: { id: true },
      });
      expect(prisma.folder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { organizationId: orgId, userId, name: 'Child', parentFolderId: folderId },
        }),
      );
    });

    it('records audit log "folder.create"', async () => {
      prisma.folder.create.mockResolvedValue(persistedFolder);

      await service.create(orgId, userId, { name: 'Personal' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId: orgId,
          action: 'folder.create',
          resource: 'folder',
          resourceId: folderId,
        }),
      );
    });
  });

  describe('list', () => {
    it('queries scoped to organizationId, keyset-ordered by name asc with a peek', async () => {
      prisma.folder.findMany.mockResolvedValue([]);

      await service.list(orgId);

      expect(prisma.folder.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        select: { id: true, name: true, parentFolderId: true, createdAt: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 51,
      });
    });

    it('wraps rows in a paginated envelope', async () => {
      prisma.folder.findMany.mockResolvedValue([persistedFolder]);

      const result = await service.list(orgId);

      expect(result).toEqual({ items: [persistedFolder], nextCursor: null });
    });

    it('applies a keyset where-clause (gt on name) when a cursor is supplied', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      const cursor = Buffer.from(JSON.stringify({ v: 'Personal', id: 'fld-x' }), 'utf8').toString(
        'base64url',
      );

      await service.list(orgId, { cursor });

      const call = prisma.folder.findMany.mock.calls[0][0] as { where: { AND?: unknown[] } };
      expect(call.where.AND).toBeDefined();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when folder belongs to another organization', async () => {
      prisma.folder.findFirst.mockResolvedValue(null);

      await expect(service.update(otherOrgId, userId, folderId, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.folder.update).not.toHaveBeenCalled();
    });

    it('renames a folder when name is provided', async () => {
      prisma.folder.findFirst.mockResolvedValue({ id: folderId, parentFolderId: null });
      prisma.folder.update.mockResolvedValue({ ...persistedFolder, name: 'Renamed' });

      await service.update(orgId, userId, folderId, { name: 'Renamed' });

      expect(prisma.folder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: folderId },
          data: { name: 'Renamed' },
        }),
      );
    });

    it('moves to root when parentFolderId is null', async () => {
      prisma.folder.findFirst.mockResolvedValue({ id: folderId, parentFolderId: 'old-parent' });
      prisma.folder.update.mockResolvedValue({ ...persistedFolder, parentFolderId: null });

      await service.update(orgId, userId, folderId, { parentFolderId: null });

      expect(prisma.folder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: folderId },
          data: { parentFolderId: null },
        }),
      );
    });

    it('rejects move to a parent owned by another organization (NotFoundException)', async () => {
      prisma.folder.findFirst
        .mockResolvedValueOnce({ id: folderId, parentFolderId: null }) // ownership
        .mockResolvedValueOnce(null); // new parent lookup

      await expect(
        service.update(orgId, userId, folderId, { parentFolderId: 'cross-org' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.folder.update).not.toHaveBeenCalled();
    });

    it('rejects move under self with BadRequestException', async () => {
      prisma.folder.findFirst.mockResolvedValueOnce({ id: folderId, parentFolderId: null });

      await expect(
        service.update(orgId, userId, folderId, { parentFolderId: folderId }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.folder.update).not.toHaveBeenCalled();
    });

    it('rejects move into own descendant (cycle) with BadRequestException', async () => {
      // ownership lookup
      prisma.folder.findFirst.mockResolvedValueOnce({ id: folderId, parentFolderId: null });
      // new parent ownership lookup
      prisma.folder.findFirst.mockResolvedValueOnce({ id: childId });
      // cycle walk: childId's parent is folderId → cycle
      prisma.folder.findFirst.mockResolvedValueOnce({ id: childId, parentFolderId: folderId });

      await expect(
        service.update(orgId, userId, folderId, { parentFolderId: childId }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.folder.update).not.toHaveBeenCalled();
    });

    it('records audit log "folder.update" with the changed fields', async () => {
      prisma.folder.findFirst.mockResolvedValue({ id: folderId, parentFolderId: null });
      prisma.folder.update.mockResolvedValue(persistedFolder);

      await service.update(orgId, userId, folderId, { name: 'NewName' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId: orgId,
          action: 'folder.update',
          resource: 'folder',
          resourceId: folderId,
          metadata: expect.objectContaining({ fields: ['name'] }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when folder belongs to another organization', async () => {
      prisma.folder.findFirst.mockResolvedValue(null);

      await expect(service.remove(otherOrgId, userId, folderId)).rejects.toThrow(NotFoundException);
      expect(prisma.folder.delete).not.toHaveBeenCalled();
    });

    it('deletes an empty folder and returns counts {1, 0}', async () => {
      prisma.folder.findFirst.mockResolvedValue({ id: folderId });
      prisma.folder.findMany.mockResolvedValue([]); // no children
      prisma.workflow.count.mockResolvedValue(0);
      prisma.folder.delete.mockResolvedValue(persistedFolder);

      const result = await service.remove(orgId, userId, folderId);

      expect(result).toEqual({ deletedFolders: 1, deletedWorkflows: 0 });
      expect(prisma.folder.delete).toHaveBeenCalledWith({ where: { id: folderId } });
    });

    it('counts descendant folders + cascaded workflows (org-scoped) before deleting', async () => {
      prisma.folder.findFirst.mockResolvedValue({ id: folderId });
      // BFS: root has one child, child has none
      prisma.folder.findMany
        .mockResolvedValueOnce([{ id: childId }]) // children of folderId
        .mockResolvedValueOnce([]); // children of childId
      prisma.workflow.count.mockResolvedValue(5);
      prisma.folder.delete.mockResolvedValue(persistedFolder);

      const result = await service.remove(orgId, userId, folderId);

      expect(prisma.workflow.count).toHaveBeenCalledWith({
        where: { organizationId: orgId, folderId: { in: [folderId, childId] } },
      });
      expect(result).toEqual({ deletedFolders: 2, deletedWorkflows: 5 });
    });

    it('records audit log "folder.delete" with the cascade counts', async () => {
      prisma.folder.findFirst.mockResolvedValue({ id: folderId });
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(3);
      prisma.folder.delete.mockResolvedValue(persistedFolder);

      await service.remove(orgId, userId, folderId);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId: orgId,
          action: 'folder.delete',
          resource: 'folder',
          resourceId: folderId,
          metadata: expect.objectContaining({ deletedFolders: 1, deletedWorkflows: 3 }),
        }),
      );
    });
  });
});
