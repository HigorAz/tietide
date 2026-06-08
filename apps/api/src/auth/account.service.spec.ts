import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { MailerService } from '../mailer/mailer.service';

jest.mock('bcrypt');

const NEUTRAL_RESEND = {
  message: 'If that email is registered and still unverified, we’ve sent a new verification link.',
};

describe('AccountService', () => {
  let service: AccountService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    organizationMember: { findMany: jest.Mock; count: jest.Mock; delete: jest.Mock };
    organization: { delete: jest.Mock };
    $transaction: jest.Mock;
  };
  let auth: { signSession: jest.Mock; issueVerificationToken: jest.Mock };
  let audit: { log: jest.Mock };
  let mailer: { sendAccountDeletedEmail: jest.Mock };
  const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      organizationMember: { findMany: jest.fn(), count: jest.fn(), delete: jest.fn() },
      organization: { delete: jest.fn() },
      // Run the interactive transaction callback against the same prisma mock.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    auth = { signSession: jest.fn(), issueVerificationToken: jest.fn(async () => undefined) };
    audit = { log: jest.fn(async () => undefined) };
    mailer = { sendAccountDeletedEmail: jest.fn(async () => undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
        { provide: AuditLogService, useValue: audit },
        { provide: MailerService, useValue: mailer },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
    jest.clearAllMocks();
    (mockedBcrypt.hash as unknown as jest.Mock).mockResolvedValue('hashed_password');
  });

  describe('updateProfile', () => {
    it('updates the name and returns only safe fields', async () => {
      const profile = {
        id: 'u1',
        email: 'a@b.com',
        name: 'New Name',
        role: 'USER',
        emailVerified: true,
        createdAt: new Date('2026-04-01T00:00:00Z'),
      };
      prisma.user.update.mockResolvedValue(profile);

      const result = await service.updateProfile('u1', 'New Name');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { name: 'New Name' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          emailVerified: true,
          createdAt: true,
        },
      });
      expect(result).toEqual(profile);
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('changePassword', () => {
    const stored = { id: 'u1', email: 'a@b.com', role: 'USER', password: 'old_hash' };

    it('rejects a wrong current password and never touches the password', async () => {
      prisma.user.findUnique.mockResolvedValue(stored);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword('u1', 'wrong', 'newpass123')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('sets the new password, bumps tokenVersion, and returns a fresh session', async () => {
      prisma.user.findUnique.mockResolvedValue(stored);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        role: 'USER',
        tokenVersion: 4,
      });
      auth.signSession.mockReturnValue({ accessToken: 'fresh.jwt', tokenType: 'Bearer' });

      const result = await service.changePassword('u1', 'oldpass123', 'newpass123');

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('newpass123', 12);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { password: 'hashed_password', tokenVersion: { increment: 1 } },
        select: { id: true, email: true, role: true, tokenVersion: true },
      });
      expect(auth.signSession).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', tokenVersion: 4 }),
      );
      expect(result).toEqual({ accessToken: 'fresh.jwt', tokenType: 'Bearer' });
    });

    it('rejects when the user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.changePassword('u1', 'oldpass123', 'newpass123')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('resendVerification', () => {
    it('issues a new token for a real, unverified, non-deleted account (neutral response)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        emailVerified: false,
        deletedAt: null,
      });

      const result = await service.resendVerification('a@b.com');

      expect(auth.issueVerificationToken).toHaveBeenCalledWith('u1', 'a@b.com');
      expect(result).toEqual(NEUTRAL_RESEND);
    });

    it('sends nothing for an already-verified account but stays neutral', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerified: true, deletedAt: null });

      const result = await service.resendVerification('a@b.com');

      expect(auth.issueVerificationToken).not.toHaveBeenCalled();
      expect(result).toEqual(NEUTRAL_RESEND);
    });

    it('sends nothing for an unknown email but stays neutral (no enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.resendVerification('ghost@b.com');

      expect(auth.issueVerificationToken).not.toHaveBeenCalled();
      expect(result).toEqual(NEUTRAL_RESEND);
    });

    it('sends nothing for a soft-deleted account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        emailVerified: false,
        deletedAt: new Date(),
      });

      const result = await service.resendVerification('a@b.com');

      expect(auth.issueVerificationToken).not.toHaveBeenCalled();
      expect(result).toEqual(NEUTRAL_RESEND);
    });
  });

  describe('deleteAccount', () => {
    const stored = { id: 'u1', email: 'a@b.com', password: 'pw_hash', deletedAt: null };

    it('rejects a wrong password and never anonymizes', async () => {
      prisma.user.findUnique.mockResolvedValue(stored);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(false);

      await expect(service.deleteAccount('u1', 'wrong')).rejects.toThrow(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mailer.sendAccountDeletedEmail).not.toHaveBeenCalled();
    });

    it('hard-deletes a sole-member workspace and anonymizes the user', async () => {
      prisma.user.findUnique.mockResolvedValue(stored);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
      prisma.organizationMember.findMany.mockResolvedValue([
        { organizationId: 'org-solo', role: 'SUPERADMIN' },
      ]);
      prisma.organizationMember.count.mockResolvedValue(1);

      await service.deleteAccount('u1', 'rightpass');

      expect(prisma.organization.delete).toHaveBeenCalledWith({ where: { id: 'org-solo' } });
      expect(prisma.organizationMember.delete).not.toHaveBeenCalled();
      const update = prisma.user.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'u1' });
      expect(update.data.deletedAt).toBeInstanceOf(Date);
      expect(update.data.email).toBe('deleted-u1@deleted.tietide.invalid');
      expect(update.data.name).toBe('Deleted account');
      expect(update.data.emailVerified).toBe(false);
      expect(update.data.defaultOrganizationId).toBeNull();
      expect(update.data.tokenVersion).toEqual({ increment: 1 });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', action: 'account.delete', resource: 'user' }),
      );
      // Account-level audit entry — never references a (possibly deleted) workspace.
      expect(audit.log.mock.calls[0][0]).not.toHaveProperty('organizationId');
      // Confirmation goes to the original address, captured before anonymization.
      expect(mailer.sendAccountDeletedEmail).toHaveBeenCalledWith('a@b.com');
    });

    it('drops membership (keeps the workspace) for a shared workspace where others remain', async () => {
      prisma.user.findUnique.mockResolvedValue(stored);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
      prisma.organizationMember.findMany.mockResolvedValue([
        { organizationId: 'org-shared', role: 'MEMBER' },
      ]);
      prisma.organizationMember.count.mockResolvedValue(3);

      await service.deleteAccount('u1', 'rightpass');

      expect(prisma.organization.delete).not.toHaveBeenCalled();
      expect(prisma.organizationMember.delete).toHaveBeenCalledWith({
        where: { organizationId_userId: { organizationId: 'org-shared', userId: 'u1' } },
      });
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('blocks deletion when the user is the last SUPERADMIN of a shared workspace', async () => {
      prisma.user.findUnique.mockResolvedValue(stored);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
      prisma.organizationMember.findMany.mockResolvedValue([
        { organizationId: 'org-shared', role: 'SUPERADMIN' },
      ]);
      // 4 members in the workspace, but only this one is SUPERADMIN.
      prisma.organizationMember.count.mockImplementation(
        async (args: { where: { role?: string } }) => (args.where.role === 'SUPERADMIN' ? 1 : 4),
      );

      await expect(service.deleteAccount('u1', 'rightpass')).rejects.toThrow(BadRequestException);
      expect(prisma.organizationMember.delete).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mailer.sendAccountDeletedEmail).not.toHaveBeenCalled();
    });
  });
});
