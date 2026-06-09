import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { MailerService } from '../mailer/mailer.service';
import { AuthService } from './auth.service';
import type { LoginResponseDto } from './dto/login-response.dto';
import type { RegisterResponseDto } from './dto/register-response.dto';
import type { UserResponseDto } from './dto/user-response.dto';

const BCRYPT_ROUNDS = 12;

// Machine-readable discriminator attached to credential-rejection 401s (wrong
// current password / wrong delete-confirmation password). Lets the SPA tell these
// apart from a genuinely expired/revoked session 401: the global exception filter
// passes `reason` through to the body, and the client skips its force-logout when
// it sees this value (otherwise a typo would sign the user out). See client.ts.
const INVALID_CREDENTIALS_REASON = 'invalid_credentials';

// Neutral regardless of whether the address belongs to a real, unverified account,
// so the endpoint cannot be used to enumerate registered emails (mirrors W2.1).
const NEUTRAL_RESEND_RESPONSE: RegisterResponseDto = {
  message: 'If that email is registered and still unverified, we’ve sent a new verification link.',
};

/**
 * Self-service account management for the Settings page. Kept separate from
 * AuthService (which is already at its size budget) but reuses its session-signing
 * and verification-token issuance so the security-sensitive logic lives in one place.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditLogService,
    private readonly mailer: MailerService,
  ) {}

  async updateProfile(userId: string, name: string): Promise<UserResponseDto> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    });
  }

  /**
   * Verify the current password, set the new one, and bump tokenVersion to revoke
   * every other outstanding session — then hand back a freshly-signed token so the
   * device making the change stays signed in (mirrors resetPassword's auto-login).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, password: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      throw new UnauthorizedException({
        message: 'Current password is incorrect',
        reason: INVALID_CREDENTIALS_REASON,
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash, tokenVersion: { increment: 1 } },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });

    return this.auth.signSession(updated);
  }

  /**
   * Re-issue an email-verification link. Sends only when the address belongs to a
   * real, still-unverified, non-deleted account; the response is identical either
   * way so it never reveals which emails are registered.
   */
  async resendVerification(email: string): Promise<RegisterResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true, deletedAt: true },
    });

    if (user && !user.emailVerified && !user.deletedAt) {
      await this.auth.issueVerificationToken(user.id, email);
    }

    return NEUTRAL_RESEND_RESPONSE;
  }

  /**
   * Self-delete: re-authenticate with the password, then in one transaction wind
   * down the user's workspaces and anonymize the user row. Workspaces where they
   * are the sole member are hard-deleted (cascade wipes workflows/triggers so
   * nothing keeps running orphaned). Shared workspaces keep running — the user's
   * membership is dropped — but deletion is blocked if they are that workspace's
   * last SUPERADMIN (it must never be left without an owner). The user row itself
   * is anonymized, not removed, so authored workflows/secrets/audit logs (Restrict
   * FKs) keep their integrity; the auth path rejects any user with deletedAt set.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      // Capture the real email now — the row is anonymized below, so we must read
      // it before the transaction to address the confirmation email correctly.
      select: { id: true, email: true, password: true, deletedAt: true },
    });
    const matches = await bcrypt.compare(password, user?.password ?? '');
    if (!user || user.deletedAt || !matches) {
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        reason: INVALID_CREDENTIALS_REASON,
      });
    }

    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true, role: true },
    });

    // Precompute the scrambled password hash outside the transaction to keep the
    // transaction short.
    const scrambledPassword = await bcrypt.hash(
      randomBytes(32).toString('base64url'),
      BCRYPT_ROUNDS,
    );

    await this.prisma.$transaction(async (tx) => {
      for (const membership of memberships) {
        const memberCount = await tx.organizationMember.count({
          where: { organizationId: membership.organizationId },
        });

        if (memberCount <= 1) {
          // Sole member → tear the whole workspace down (cascade removes its
          // workflows, secrets, connections, folders, tags, env-vars, invites and
          // org-scoped audit logs, so nothing is left running).
          await tx.organization.delete({ where: { id: membership.organizationId } });
          continue;
        }

        // Shared workspace: never leave it without an owner.
        if (membership.role === 'SUPERADMIN') {
          const superadminCount = await tx.organizationMember.count({
            where: { organizationId: membership.organizationId, role: 'SUPERADMIN' },
          });
          if (superadminCount <= 1) {
            throw new BadRequestException(
              'Promote another SUPERADMIN in each shared workspace before deleting your account.',
            );
          }
        }

        await tx.organizationMember.delete({
          where: {
            organizationId_userId: { organizationId: membership.organizationId, userId },
          },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          // Free the original email for re-registration while satisfying the unique
          // constraint, and strip identifying fields.
          email: `deleted-${userId}@deleted.tietide.invalid`,
          name: 'Deleted account',
          password: scrambledPassword,
          emailVerified: false,
          deletedAt: new Date(),
          defaultOrganizationId: null,
          tokenVersion: { increment: 1 },
        },
      });
    });

    // Account-level audit entry (no organizationId) so it does not reference a
    // workspace that may have just been deleted in the transaction above.
    await this.audit.log({
      userId,
      action: 'account.delete',
      resource: 'user',
      resourceId: userId,
    });

    // Best-effort confirmation to the original address (MailerService swallows any
    // delivery failure, so it can never undo a deletion that already committed).
    await this.mailer.sendAccountDeletedEmail(user.email);
  }
}
