import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ORG_ROLE_RANK, type OrgRole } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { MailerService } from '../mailer/mailer.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { SeatSyncService } from '../billing/seat-sync.service';
import { OrganizationAccessService } from './organization-access.service';
import type { CreateInviteDto } from './dto/create-invite.dto';
import type { AcceptInviteDto } from './dto/accept-invite.dto';
import type { OrganizationSummaryDto } from './dto/organization-summary.dto';
import type { OrgInviteResponseDto } from './dto/org-invite-response.dto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MANAGER_ROLES: OrgRole[] = ['SUPERADMIN', 'ADMIN'];

// One neutral message for every accept-invite failure (unknown/expired/replayed/
// wrong-email) so the endpoint cannot be used to probe which tokens or emails exist.
const INVALID_INVITE = 'This invitation is invalid or has expired.';

@Injectable()
export class OrganizationInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly mailer: MailerService,
    private readonly access: OrganizationAccessService,
    private readonly entitlements: EntitlementsService,
    private readonly seatSync: SeatSyncService,
  ) {}

  async create(
    orgId: string,
    actingUserId: string,
    dto: CreateInviteDto,
  ): Promise<OrgInviteResponseDto> {
    const actingRole = await this.access.requireRole(orgId, actingUserId, MANAGER_ROLES);
    if (ORG_ROLE_RANK[dto.role] > ORG_ROLE_RANK[actingRole]) {
      throw new ForbiddenException('Cannot invite at a role above your own');
    }
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: { id: true, name: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    // Seat cap: members + outstanding invites must stay within the plan's seats.
    await this.entitlements.assertCanAddSeat(orgId, true);

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await this.prisma.organizationInvite.create({
      data: {
        organizationId: orgId,
        email: dto.email,
        role: dto.role,
        tokenHash,
        invitedById: actingUserId,
        expiresAt,
      },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });

    await this.mailer.sendOrganizationInviteEmail(dto.email, rawToken, org.name);
    await this.audit.log({
      userId: actingUserId,
      organizationId: orgId,
      action: 'org.invite.create',
      resource: 'organization-invite',
      resourceId: invite.id,
      metadata: { email: dto.email, role: dto.role },
    });
    return { ...invite, role: invite.role as OrgRole };
  }

  async list(orgId: string, userId: string): Promise<OrgInviteResponseDto[]> {
    await this.access.requireRole(orgId, userId, MANAGER_ROLES);
    const invites = await this.prisma.organizationInvite.findMany({
      where: { organizationId: orgId, consumedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((i) => ({ ...i, role: i.role as OrgRole }));
  }

  async revoke(orgId: string, userId: string, inviteId: string): Promise<void> {
    await this.access.requireRole(orgId, userId, MANAGER_ROLES);
    const { count } = await this.prisma.organizationInvite.deleteMany({
      where: { id: inviteId, organizationId: orgId },
    });
    if (count === 0) {
      throw new NotFoundException('Invite not found');
    }
    await this.audit.log({
      userId,
      organizationId: orgId,
      action: 'org.invite.revoke',
      resource: 'organization-invite',
      resourceId: inviteId,
    });
  }

  async accept(
    userId: string,
    userEmail: string,
    dto: AcceptInviteDto,
  ): Promise<OrganizationSummaryDto> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const invite = await this.prisma.organizationInvite.findUnique({
      where: { tokenHash },
      select: { id: true, organizationId: true, email: true, role: true },
    });
    // Verify the email match BEFORE consuming, so a wrong-user click cannot burn
    // the single-use token out from under the rightful invitee.
    if (!invite || invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new BadRequestException(INVALID_INVITE);
    }

    // Seat cap, checked BEFORE consuming the single-use token so a full workspace
    // doesn't burn the invite. Already-members re-accept idempotently (no new seat),
    // so they bypass the cap.
    const alreadyMember = await this.access.getMembership(invite.organizationId, userId);
    if (!alreadyMember) {
      await this.entitlements.assertCanAddSeat(invite.organizationId, false);
    }

    const now = new Date();
    const consumed = await this.prisma.organizationInvite.updateMany({
      where: { id: invite.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException(INVALID_INVITE);
    }

    try {
      // W5.25: the assertCanAddSeat pre-check above is not atomic with this
      // create, so concurrent accepts at the seat-cap boundary could all pass and
      // all insert (overshoot). enforceSeatCapAround runs the membership insert + a
      // post-create member re-count in one serializable transaction and rolls back
      // the loser. Skip the wrapper for already-members (no seat consumed).
      if (alreadyMember) {
        await this.prisma.organizationMember.create({
          data: { organizationId: invite.organizationId, userId, role: invite.role },
        });
      } else {
        await this.entitlements.enforceSeatCapAround(invite.organizationId, (tx) =>
          tx.organizationMember.create({
            data: { organizationId: invite.organizationId, userId, role: invite.role },
          }),
        );
      }
    } catch (err) {
      // Already a member — accepting is idempotent; keep their existing role.
      if (!this.access.isUniqueViolation(err)) throw err;
    }

    // A new member consumed a seat → reconcile the Stripe seat quantity (async,
    // no-op for FREE/unsubscribed). Skip when they were already a member.
    if (!alreadyMember) {
      await this.seatSync.enqueue(invite.organizationId);
    }

    await this.access.adoptAsDefaultIfNone(userId, invite.organizationId);
    const org = await this.prisma.organization.findFirst({
      where: { id: invite.organizationId },
      select: { id: true, name: true, slug: true },
    });
    if (!org) {
      throw new BadRequestException(INVALID_INVITE);
    }

    await this.audit.log({
      userId,
      organizationId: invite.organizationId,
      action: 'org.invite.accept',
      resource: 'organization-invite',
      resourceId: invite.id,
      metadata: { role: invite.role },
    });
    return { id: org.id, name: org.name, slug: org.slug, role: invite.role as OrgRole };
  }
}
