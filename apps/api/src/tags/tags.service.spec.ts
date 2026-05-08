import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { TagsService } from './tags.service';

describe('TagsService', () => {
  let service: TagsService;
  let prisma: {
    tag: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };

  const userId = 'user-uuid-1';
  const otherUserId = 'user-uuid-2';
  const tagId = 'tag-uuid-1';

  beforeEach(async () => {
    prisma = {
      tag: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: audit },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
    jest.clearAllMocks();
  });

  const persisted = {
    id: tagId,
    name: 'client-a',
    color: '#3366cc',
    createdAt: new Date('2026-05-08T00:00:00Z'),
  };

  describe('create', () => {
    it('persists with userId, name, color', async () => {
      prisma.tag.create.mockResolvedValue(persisted);

      await service.create(userId, { name: 'client-a', color: '#3366cc' });

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId, name: 'client-a', color: '#3366cc' },
        }),
      );
    });

    it('persists null color when omitted', async () => {
      prisma.tag.create.mockResolvedValue({ ...persisted, color: null });

      await service.create(userId, { name: 'client-a' });

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId, name: 'client-a', color: null },
        }),
      );
    });

    it('returns SAFE_SELECT shape — no userId leaked', async () => {
      prisma.tag.create.mockResolvedValue(persisted);

      const result = await service.create(userId, { name: 'client-a' });

      expect(result).toEqual(persisted);
      expect(result).not.toHaveProperty('userId');
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      prisma.tag.create.mockRejectedValue(p2002);

      await expect(service.create(userId, { name: 'client-a' })).rejects.toThrow(ConflictException);
    });

    it('records audit log "tag.create"', async () => {
      prisma.tag.create.mockResolvedValue(persisted);

      await service.create(userId, { name: 'client-a' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'tag.create',
          resource: 'tag',
          resourceId: tagId,
        }),
      );
    });
  });

  describe('list', () => {
    it('queries scoped to userId, ordered by name asc', async () => {
      prisma.tag.findMany.mockResolvedValue([]);

      await service.list(userId);

      expect(prisma.tag.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: { id: true, name: true, color: true, createdAt: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when tag belongs to another user', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.update(otherUserId, tagId, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });

    it('renames a tag', async () => {
      prisma.tag.findFirst.mockResolvedValue({ id: tagId });
      prisma.tag.update.mockResolvedValue({ ...persisted, name: 'renamed' });

      await service.update(userId, tagId, { name: 'renamed' });

      expect(prisma.tag.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: tagId },
          data: { name: 'renamed' },
        }),
      );
    });

    it('updates only color when only color provided', async () => {
      prisma.tag.findFirst.mockResolvedValue({ id: tagId });
      prisma.tag.update.mockResolvedValue({ ...persisted, color: '#aaaaaa' });

      await service.update(userId, tagId, { color: '#aaaaaa' });

      const call = prisma.tag.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).toEqual({ color: '#aaaaaa' });
    });

    it('clears color when null provided', async () => {
      prisma.tag.findFirst.mockResolvedValue({ id: tagId });
      prisma.tag.update.mockResolvedValue({ ...persisted, color: null });

      await service.update(userId, tagId, { color: null });

      const call = prisma.tag.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).toEqual({ color: null });
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      prisma.tag.findFirst.mockResolvedValue({ id: tagId });
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      prisma.tag.update.mockRejectedValue(p2002);

      await expect(service.update(userId, tagId, { name: 'dup' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('records audit log "tag.update"', async () => {
      prisma.tag.findFirst.mockResolvedValue({ id: tagId });
      prisma.tag.update.mockResolvedValue(persisted);

      await service.update(userId, tagId, { name: 'newname' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'tag.update',
          resource: 'tag',
          resourceId: tagId,
          metadata: expect.objectContaining({ fields: ['name'] }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('deletes scoped to (id, userId)', async () => {
      prisma.tag.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(userId, tagId);

      expect(prisma.tag.deleteMany).toHaveBeenCalledWith({ where: { id: tagId, userId } });
    });

    it('throws NotFoundException when tag belongs to another user', async () => {
      prisma.tag.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(otherUserId, tagId)).rejects.toThrow(NotFoundException);
    });

    it('records audit log "tag.delete"', async () => {
      prisma.tag.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(userId, tagId);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'tag.delete',
          resource: 'tag',
          resourceId: tagId,
        }),
      );
    });
  });
});
