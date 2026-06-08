import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { MailerService } from '../mailer/mailer.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { SeatSyncService } from '../billing/seat-sync.service';
import { OrganizationAccessService } from './organization-access.service';
import { OrganizationInvitesService } from './organization-invites.service';

interface PrismaMock {
  organization: { findFirst: jest.Mock };
  organizationMember: { findFirst: jest.Mock; create: jest.Mock };
  organizationInvite: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  user: { updateMany: jest.Mock };
}

describe('OrganizationInvitesService', () => {
  let service: OrganizationInvitesService;
  let prisma: PrismaMock;
  let mailer: { sendOrganizationInviteEmail: jest.Mock };
  let audit: { log: jest.Mock };
  let entitlements: { assertCanAddSeat: jest.Mock };

  const orgId = 'org-uuid-1';
  const actingUserId = 'user-acting';
  const targetUserId = 'user-target';

  const member = (role: string, userId = actingUserId) => ({ userId, role });

  beforeEach(async () => {
    prisma = {
      organization: { findFirst: jest.fn() },
      organizationMember: { findFirst: jest.fn(), create: jest.fn() },
      organizationInvite: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: { updateMany: jest.fn() },
    };
    mailer = { sendOrganizationInviteEmail: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    entitlements = { assertCanAddSeat: jest.fn().mockResolvedValue(undefined) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationInvitesService,
        OrganizationAccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: audit },
        { provide: MailerService, useValue: mailer },
        { provide: EntitlementsService, useValue: entitlements },
        { provide: SeatSyncService, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();

    service = mod.get(OrganizationInvitesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('issues a hashed invite, emails the link, and returns the view without the token hash', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('ADMIN'));
      prisma.organization.findFirst.mockResolvedValue({ id: orgId, name: 'Acme' });
      prisma.organizationInvite.create.mockResolvedValue({
        id: 'inv-1',
        email: 'new@x.com',
        role: 'MEMBER',
        expiresAt: new Date('2026-06-08T00:00:00Z'),
        createdAt: new Date('2026-06-01T00:00:00Z'),
      });

      const result = await service.create(orgId, actingUserId, {
        email: 'new@x.com',
        role: 'MEMBER',
      });

      expect(prisma.organizationInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            email: 'new@x.com',
            role: 'MEMBER',
            invitedById: actingUserId,
          }),
        }),
      );
      // tokenHash is a stored sha256 of the emailed raw token, never returned.
      const created = prisma.organizationInvite.create.mock.calls[0][0].data;
      expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(mailer.sendOrganizationInviteEmail).toHaveBeenCalledWith(
        'new@x.com',
        expect.any(String),
        'Acme',
      );
      expect(result).not.toHaveProperty('tokenHash');
      expect(result.id).toBe('inv-1');
    });

    it('forbids an ADMIN from inviting at SUPERADMIN role', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('ADMIN'));

      await expect(
        service.create(orgId, actingUserId, { email: 'x@x.com', role: 'SUPERADMIN' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.organizationInvite.create).not.toHaveBeenCalled();
    });

    it('forbids a MEMBER from inviting', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('MEMBER'));

      await expect(
        service.create(orgId, actingUserId, { email: 'x@x.com', role: 'MEMBER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects (without writing an invite) when the seat cap is reached', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('ADMIN'));
      prisma.organization.findFirst.mockResolvedValue({ id: orgId, name: 'Acme' });
      entitlements.assertCanAddSeat.mockRejectedValueOnce(new Error('no seats'));

      await expect(
        service.create(orgId, actingUserId, { email: 'x@x.com', role: 'MEMBER' }),
      ).rejects.toThrow('no seats');
      expect(entitlements.assertCanAddSeat).toHaveBeenCalledWith(orgId, true);
      expect(prisma.organizationInvite.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns only pending (unconsumed, unexpired) invites for a manager', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('ADMIN'));
      prisma.organizationInvite.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          email: 'a@x.com',
          role: 'MEMBER',
          expiresAt: new Date('2026-06-08T00:00:00Z'),
          createdAt: new Date('2026-06-01T00:00:00Z'),
        },
      ]);

      const result = await service.list(orgId, actingUserId);

      const where = prisma.organizationInvite.findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBe(orgId);
      expect(where.consumedAt).toBeNull();
      expect(result[0]).not.toHaveProperty('tokenHash');
    });

    it('forbids a VIEWER from listing invites', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('VIEWER'));
      await expect(service.list(orgId, actingUserId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('revoke', () => {
    it('deletes a pending invite scoped to the org', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('ADMIN'));
      prisma.organizationInvite.deleteMany.mockResolvedValue({ count: 1 });

      await service.revoke(orgId, actingUserId, 'inv-1');

      expect(prisma.organizationInvite.deleteMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', organizationId: orgId },
      });
    });

    it('throws NotFound when the invite does not exist in the org', async () => {
      prisma.organizationMember.findFirst.mockResolvedValue(member('ADMIN'));
      prisma.organizationInvite.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.revoke(orgId, actingUserId, 'inv-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('accept', () => {
    const rawToken = 'raw-invite-token';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    it('consumes a valid invite for the matching email and creates membership', async () => {
      prisma.organizationInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        organizationId: orgId,
        email: 'new@x.com',
        role: 'MEMBER',
      });
      prisma.organizationInvite.updateMany.mockResolvedValue({ count: 1 });
      prisma.organizationMember.create.mockResolvedValue({ id: 'm-new' });
      prisma.organization.findFirst.mockResolvedValue({ id: orgId, name: 'Acme', slug: 'acme-1' });
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.accept(targetUserId, 'new@x.com', { token: rawToken });

      expect(prisma.organizationInvite.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash } }),
      );
      expect(prisma.organizationInvite.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'inv-1', consumedAt: null }),
        }),
      );
      expect(prisma.organizationMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            userId: targetUserId,
            role: 'MEMBER',
          }),
        }),
      );
      expect(result).toEqual({ id: orgId, name: 'Acme', slug: 'acme-1', role: 'MEMBER' });
    });

    it('rejects (without consuming) when the workspace is at its seat cap', async () => {
      prisma.organizationInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        organizationId: orgId,
        email: 'new@x.com',
        role: 'MEMBER',
      });
      // Not already a member, so the seat cap applies and blocks the join.
      prisma.organizationMember.findFirst.mockResolvedValue(null);
      entitlements.assertCanAddSeat.mockRejectedValueOnce(new Error('no seats'));

      await expect(service.accept(targetUserId, 'new@x.com', { token: rawToken })).rejects.toThrow(
        'no seats',
      );
      expect(entitlements.assertCanAddSeat).toHaveBeenCalledWith(orgId, false);
      // Must NOT consume the single-use token — they can join once a seat frees up.
      expect(prisma.organizationInvite.updateMany).not.toHaveBeenCalled();
    });

    it('rejects with a generic error when the token is unknown', async () => {
      prisma.organizationInvite.findUnique.mockResolvedValue(null);

      await expect(service.accept(targetUserId, 'new@x.com', { token: 'nope' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.organizationMember.create).not.toHaveBeenCalled();
    });

    it('rejects (without consuming) when the authenticated email does not match the invite', async () => {
      prisma.organizationInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        organizationId: orgId,
        email: 'intended@x.com',
        role: 'MEMBER',
      });

      await expect(
        service.accept(targetUserId, 'someone-else@x.com', { token: rawToken }),
      ).rejects.toThrow(BadRequestException);
      // Must NOT consume — the rightful invitee can still accept later.
      expect(prisma.organizationInvite.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a replayed/expired invite (atomic consume flips zero rows)', async () => {
      prisma.organizationInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        organizationId: orgId,
        email: 'new@x.com',
        role: 'MEMBER',
      });
      prisma.organizationInvite.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.accept(targetUserId, 'new@x.com', { token: rawToken })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.organizationMember.create).not.toHaveBeenCalled();
    });

    it('is idempotent when the user is already a member (P2002 on membership create)', async () => {
      prisma.organizationInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        organizationId: orgId,
        email: 'new@x.com',
        role: 'MEMBER',
      });
      prisma.organizationInvite.updateMany.mockResolvedValue({ count: 1 });
      prisma.organizationMember.create.mockRejectedValue(
        Object.assign(new Error('dup'), { code: 'P2002' }),
      );
      prisma.organization.findFirst.mockResolvedValue({ id: orgId, name: 'Acme', slug: 'acme-1' });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.accept(targetUserId, 'new@x.com', { token: rawToken });

      expect(result.id).toBe(orgId);
    });
  });
});
