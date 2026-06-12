import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { SeatSyncService } from '../billing/seat-sync.service';
import { PaymentRequiredException } from '../billing/payment-required.exception';
import { OrganizationAccessService } from './organization-access.service';
import { OrganizationsService } from './organizations.service';

interface PrismaMock {
  $transaction: jest.Mock;
  organization: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  organizationMember: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  organizationInvite: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  subscription: { create: jest.Mock };
  user: { update: jest.Mock; updateMany: jest.Mock };
}

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: PrismaMock;
  let audit: { log: jest.Mock; logSync: jest.Mock };
  let entitlements: { assertCanCreateWorkspace: jest.Mock };

  const orgId = 'org-uuid-1';
  const actingUserId = 'user-acting';
  const targetUserId = 'user-target';

  const member = (role: string, userId = actingUserId) => ({ userId, role });

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb: (tx: PrismaMock) => unknown) => cb(prisma)),
      organization: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      organizationMember: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      organizationInvite: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      subscription: { create: jest.fn() },
      user: { update: jest.fn(), updateMany: jest.fn() },
    };
    audit = {
      log: jest.fn().mockResolvedValue(undefined),
      logSync: jest.fn().mockResolvedValue(undefined),
    };
    entitlements = { assertCanCreateWorkspace: jest.fn().mockResolvedValue(undefined) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        OrganizationAccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: audit },
        { provide: EntitlementsService, useValue: entitlements },
        { provide: SeatSyncService, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();

    service = mod.get(OrganizationsService);
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: (tx: PrismaMock) => unknown) => cb(prisma));
  });

  describe('create', () => {
    it('creates the org, makes the caller a SUPERADMIN member, and sets default org when unset', async () => {
      prisma.organization.create.mockResolvedValue({
        id: orgId,
        name: 'Acme',
        slug: 'acme-abc123',
        createdAt: new Date('2026-06-01T00:00:00Z'),
      });
      prisma.organizationMember.create.mockResolvedValue({ id: 'm1' });
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.create(actingUserId, { name: 'Acme' });

      expect(prisma.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Acme', createdById: actingUserId }),
        }),
      );
      expect(prisma.organizationMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            userId: actingUserId,
            role: 'SUPERADMIN',
          }),
        }),
      );
      // Only sets default when the user has none yet (idempotent updateMany guard).
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: actingUserId, defaultOrganizationId: null },
        data: { defaultOrganizationId: orgId },
      });
      expect(result).toEqual({ id: orgId, name: 'Acme', slug: 'acme-abc123', role: 'SUPERADMIN' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'org.create', organizationId: orgId }),
      );
    });

    it('retries slug generation on a unique-violation collision', async () => {
      prisma.organization.create
        .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }))
        .mockResolvedValueOnce({
          id: orgId,
          name: 'Acme',
          slug: 'acme-second',
          createdAt: new Date(),
        });
      prisma.organizationMember.create.mockResolvedValue({ id: 'm1' });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.create(actingUserId, { name: 'Acme' });

      expect(prisma.organization.create).toHaveBeenCalledTimes(2);
      expect(result.slug).toBe('acme-second');
    });

    it('rejects creation when the free-workspace cap is reached (no org written)', async () => {
      entitlements.assertCanCreateWorkspace.mockRejectedValueOnce(
        new PaymentRequiredException('workspaces', 'limit reached'),
      );

      await expect(service.create(actingUserId, { name: 'Acme' })).rejects.toBeInstanceOf(
        PaymentRequiredException,
      );
      expect(prisma.organization.create).not.toHaveBeenCalled();
    });
  });

  describe('listForUser', () => {
    it('returns the caller memberships as {id,name,slug,role}', async () => {
      prisma.organizationMember.findMany.mockResolvedValue([
        {
          role: 'SUPERADMIN',
          organization: { id: orgId, name: 'Acme', slug: 'acme-1' },
        },
        {
          role: 'VIEWER',
          organization: { id: 'org-2', name: 'Beta', slug: 'beta-2' },
        },
      ]);

      const result = await service.listForUser(actingUserId);

      expect(prisma.organizationMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: actingUserId } }),
      );
      expect(result).toEqual([
        { id: orgId, name: 'Acme', slug: 'acme-1', role: 'SUPERADMIN' },
        { id: 'org-2', name: 'Beta', slug: 'beta-2', role: 'VIEWER' },
      ]);
    });
  });

  describe('findOne', () => {
    it('returns org details for a member', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('MEMBER'));
      prisma.organization.findFirst.mockResolvedValue({
        id: orgId,
        name: 'Acme',
        slug: 'acme-1',
        createdAt: new Date('2026-06-01T00:00:00Z'),
      });

      const result = await service.findOne(orgId, actingUserId);

      expect(result.id).toBe(orgId);
      expect(result.name).toBe('Acme');
    });

    it('throws NotFound when the caller is not a member (does not reveal existence)', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(null);

      await expect(service.findOne(orgId, actingUserId)).rejects.toThrow(NotFoundException);
      expect(prisma.organization.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('rename', () => {
    it('renames when the caller is SUPERADMIN', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('SUPERADMIN'));
      prisma.organization.update.mockResolvedValue({
        id: orgId,
        name: 'Renamed',
        slug: 'acme-1',
        createdAt: new Date(),
      });

      const result = await service.rename(orgId, actingUserId, { name: 'Renamed' });

      expect(prisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: orgId }, data: { name: 'Renamed' } }),
      );
      expect(result.name).toBe('Renamed');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'org.rename', organizationId: orgId }),
      );
    });

    it('forbids rename for a non-SUPERADMIN member (ADMIN)', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('ADMIN'));

      await expect(service.rename(orgId, actingUserId, { name: 'X' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the org when caller is SUPERADMIN and it is not their only org', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('SUPERADMIN'));
      // The caller belongs to 2 orgs, so deleting this one is allowed.
      prisma.organizationMember.count.mockResolvedValue(2);
      prisma.organization.delete.mockResolvedValue({ id: orgId });

      await service.remove(orgId, actingUserId);

      expect(prisma.organization.delete).toHaveBeenCalledWith({ where: { id: orgId } });
    });

    it('writes a DURABLE workspace.deleted audit entry BEFORE deleting (W5.20)', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('SUPERADMIN'));
      prisma.organizationMember.count.mockResolvedValue(2);
      const order: string[] = [];
      audit.logSync.mockImplementation(async () => {
        order.push('audit');
      });
      prisma.organization.delete.mockImplementation(async () => {
        order.push('delete');
        return { id: orgId };
      });

      await service.remove(orgId, actingUserId);

      // The deletion is recorded durably (awaited logSync, not fire-and-forget log).
      expect(audit.logSync).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: actingUserId,
          organizationId: orgId,
          action: 'workspace.deleted',
          resource: 'organization',
          resourceId: orgId,
        }),
      );
      // The audit row must be written BEFORE the cascade so the event is never lost.
      expect(order).toEqual(['audit', 'delete']);
      // The lossy fire-and-forget path must NOT be used for this security event.
      expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'org.delete' }));
    });

    it('does not delete the org if the durable audit write fails (W5.20)', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('SUPERADMIN'));
      prisma.organizationMember.count.mockResolvedValue(2);
      audit.logSync.mockRejectedValueOnce(new Error('db down'));

      await expect(service.remove(orgId, actingUserId)).rejects.toThrow('db down');
      expect(prisma.organization.delete).not.toHaveBeenCalled();
    });

    it('blocks deleting the caller’s only org', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('SUPERADMIN'));
      prisma.organizationMember.count.mockResolvedValue(1);

      await expect(service.remove(orgId, actingUserId)).rejects.toThrow(BadRequestException);
      expect(prisma.organization.delete).not.toHaveBeenCalled();
    });

    it('forbids delete for ADMIN', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('ADMIN'));

      await expect(service.remove(orgId, actingUserId)).rejects.toThrow(ForbiddenException);
      expect(prisma.organization.delete).not.toHaveBeenCalled();
    });
  });

  describe('listMembers', () => {
    it('returns members with identity for any member', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('VIEWER'));
      prisma.organizationMember.findMany.mockResolvedValue([
        {
          userId: 'u1',
          role: 'SUPERADMIN',
          createdAt: new Date('2026-06-01T00:00:00Z'),
          user: { email: 'a@x.com', name: 'Ada' },
        },
      ]);

      const result = await service.listMembers(orgId, actingUserId);

      expect(result).toEqual([
        {
          userId: 'u1',
          email: 'a@x.com',
          name: 'Ada',
          role: 'SUPERADMIN',
          createdAt: new Date('2026-06-01T00:00:00Z'),
        },
      ]);
    });

    it('throws NotFound for a non-member', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(null);
      await expect(service.listMembers(orgId, actingUserId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('changeMemberRole', () => {
    const setActing = (role: string) =>
      prisma.organizationMember.findFirst.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(
            where.userId === actingUserId
              ? member(role, actingUserId)
              : member('MEMBER', targetUserId),
          ),
      );

    it('lets a SUPERADMIN promote a MEMBER to ADMIN', async () => {
      setActing('SUPERADMIN');
      prisma.organizationMember.update.mockResolvedValue({
        userId: targetUserId,
        role: 'ADMIN',
        createdAt: new Date(),
        user: { email: 't@x.com', name: 'Tom' },
      });

      const result = await service.changeMemberRole(orgId, actingUserId, targetUserId, {
        role: 'ADMIN',
      });

      expect(result.role).toBe('ADMIN');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'org.member.role_change' }),
      );
    });

    it('forbids a MEMBER from changing roles', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('MEMBER'));
      await expect(
        service.changeMemberRole(orgId, actingUserId, targetUserId, { role: 'ADMIN' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids an ADMIN from granting SUPERADMIN (above own rank)', async () => {
      prisma.organizationMember.findFirst.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(
            where.userId === actingUserId
              ? member('ADMIN', actingUserId)
              : member('MEMBER', targetUserId),
          ),
      );

      await expect(
        service.changeMemberRole(orgId, actingUserId, targetUserId, { role: 'SUPERADMIN' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.organizationMember.update).not.toHaveBeenCalled();
    });

    it('forbids an ADMIN from acting on a SUPERADMIN target (above own rank)', async () => {
      prisma.organizationMember.findFirst.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(
            where.userId === actingUserId
              ? member('ADMIN', actingUserId)
              : member('SUPERADMIN', targetUserId),
          ),
      );

      await expect(
        service.changeMemberRole(orgId, actingUserId, targetUserId, { role: 'MEMBER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks demoting the last SUPERADMIN', async () => {
      prisma.organizationMember.findFirst.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(
            where.userId === actingUserId
              ? member('SUPERADMIN', actingUserId)
              : member('SUPERADMIN', targetUserId),
          ),
      );
      prisma.organizationMember.count.mockResolvedValue(1);

      await expect(
        service.changeMemberRole(orgId, actingUserId, targetUserId, { role: 'ADMIN' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organizationMember.update).not.toHaveBeenCalled();
    });

    it('throws NotFound when the target is not a member', async () => {
      prisma.organizationMember.findFirst.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(
            where.userId === actingUserId ? member('SUPERADMIN', actingUserId) : null,
          ),
      );

      await expect(
        service.changeMemberRole(orgId, actingUserId, targetUserId, { role: 'ADMIN' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember', () => {
    it('lets a SUPERADMIN remove a MEMBER', async () => {
      prisma.organizationMember.findFirst.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(
            where.userId === actingUserId
              ? member('SUPERADMIN', actingUserId)
              : member('MEMBER', targetUserId),
          ),
      );
      prisma.organizationMember.delete.mockResolvedValue({ userId: targetUserId });

      await service.removeMember(orgId, actingUserId, targetUserId);

      expect(prisma.organizationMember.delete).toHaveBeenCalledWith({
        where: { organizationId_userId: { organizationId: orgId, userId: targetUserId } },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'org.member.remove' }),
      );
    });

    it('forbids an ADMIN from removing a SUPERADMIN', async () => {
      prisma.organizationMember.findFirst.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(
            where.userId === actingUserId
              ? member('ADMIN', actingUserId)
              : member('SUPERADMIN', targetUserId),
          ),
      );

      await expect(service.removeMember(orgId, actingUserId, targetUserId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.organizationMember.delete).not.toHaveBeenCalled();
    });

    it('blocks removing the last SUPERADMIN', async () => {
      prisma.organizationMember.findFirst.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          Promise.resolve(
            where.userId === actingUserId
              ? member('SUPERADMIN', actingUserId)
              : member('SUPERADMIN', targetUserId),
          ),
      );
      prisma.organizationMember.count.mockResolvedValue(1);

      await expect(service.removeMember(orgId, actingUserId, targetUserId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
