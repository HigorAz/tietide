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

  const orgId = 'org-uuid-1';
  const otherOrgId = 'org-uuid-2';
  const userId = 'user-uuid-1';
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
    it('persists with organizationId, userId, name, color', async () => {
      prisma.tag.create.mockResolvedValue(persisted);

      await service.create(orgId, userId, { name: 'client-a', color: '#3366cc' });

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { organizationId: orgId, userId, name: 'client-a', color: '#3366cc' },
        }),
      );
    });

    it('persists null color when omitted', async () => {
      prisma.tag.create.mockResolvedValue({ ...persisted, color: null });

      await service.create(orgId, userId, { name: 'client-a' });

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { organizationId: orgId, userId, name: 'client-a', color: null },
        }),
      );
    });

    it('returns SAFE_SELECT shape — no userId/organizationId leaked', async () => {
      prisma.tag.create.mockResolvedValue(persisted);

      const result = await service.create(orgId, userId, { name: 'client-a' });

      expect(result).toEqual(persisted);
      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('organizationId');
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      prisma.tag.create.mockRejectedValue(p2002);

      await expect(service.create(orgId, userId, { name: 'client-a' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('records audit log "tag.create" scoped to the organization', async () => {
      prisma.tag.create.mockResolvedValue(persisted);

      await service.create(orgId, userId, { name: 'client-a' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId: orgId,
          action: 'tag.create',
          resource: 'tag',
          resourceId: tagId,
        }),
      );
    });
  });

  describe('list', () => {
    it('queries scoped to organizationId, keyset-ordered by name asc with a peek', async () => {
      prisma.tag.findMany.mockResolvedValue([]);

      await service.list(orgId);

      expect(prisma.tag.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        select: { id: true, name: true, color: true, createdAt: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 51,
      });
    });

    it('wraps rows in a paginated envelope', async () => {
      prisma.tag.findMany.mockResolvedValue([persisted]);

      const result = await service.list(orgId);

      expect(result).toEqual({ items: [persisted], nextCursor: null });
    });

    it('applies a keyset where-clause (gt on name) when a cursor is supplied', async () => {
      prisma.tag.findMany.mockResolvedValue([]);
      const cursor = Buffer.from(JSON.stringify({ v: 'client-a', id: 'tag-x' }), 'utf8').toString(
        'base64url',
      );

      await service.list(orgId, { cursor });

      const call = prisma.tag.findMany.mock.calls[0][0] as { where: { AND?: unknown[] } };
      expect(call.where.AND).toBeDefined();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when tag belongs to another organization', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.update(otherOrgId, userId, tagId, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.tag.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: tagId, organizationId: otherOrgId } }),
      );
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });

    it('renames a tag', async () => {
      prisma.tag.findFirst.mockResolvedValue({ id: tagId });
      prisma.tag.update.mockResolvedValue({ ...persisted, name: 'renamed' });

      await service.update(orgId, userId, tagId, { name: 'renamed' });

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

      await service.update(orgId, userId, tagId, { color: '#aaaaaa' });

      const call = prisma.tag.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).toEqual({ color: '#aaaaaa' });
    });

    it('clears color when null provided', async () => {
      prisma.tag.findFirst.mockResolvedValue({ id: tagId });
      prisma.tag.update.mockResolvedValue({ ...persisted, color: null });

      await service.update(orgId, userId, tagId, { color: null });

      const call = prisma.tag.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).toEqual({ color: null });
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      prisma.tag.findFirst.mockResolvedValue({ id: tagId });
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      prisma.tag.update.mockRejectedValue(p2002);

      await expect(service.update(orgId, userId, tagId, { name: 'dup' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('records audit log "tag.update"', async () => {
      prisma.tag.findFirst.mockResolvedValue({ id: tagId });
      prisma.tag.update.mockResolvedValue(persisted);

      await service.update(orgId, userId, tagId, { name: 'newname' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId: orgId,
          action: 'tag.update',
          resource: 'tag',
          resourceId: tagId,
          metadata: expect.objectContaining({ fields: ['name'] }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('deletes scoped to (id, organizationId)', async () => {
      prisma.tag.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(orgId, userId, tagId);

      expect(prisma.tag.deleteMany).toHaveBeenCalledWith({
        where: { id: tagId, organizationId: orgId },
      });
    });

    it('throws NotFoundException when tag belongs to another organization', async () => {
      prisma.tag.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(otherOrgId, userId, tagId)).rejects.toThrow(NotFoundException);
    });

    it('records audit log "tag.delete"', async () => {
      prisma.tag.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(orgId, userId, tagId);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId: orgId,
          action: 'tag.delete',
          resource: 'tag',
          resourceId: tagId,
        }),
      );
    });
  });
});
