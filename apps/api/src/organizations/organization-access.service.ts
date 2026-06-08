import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ORG_ROLE_RANK, type OrgRole } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface Membership {
  userId: string;
  role: OrgRole;
}

/**
 * Shared org membership + role-gating used by both OrganizationsService and
 * OrganizationInvitesService. Centralizes the access invariants (member-only 404,
 * rank ceilings, last-SUPERADMIN) so they read identically everywhere.
 */
@Injectable()
export class OrganizationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getMembership(orgId: string, userId: string): Promise<Membership | null> {
    const m = await this.prisma.organizationMember.findFirst({
      where: { organizationId: orgId, userId },
      select: { userId: true, role: true },
    });
    return m ? { userId: m.userId, role: m.role as OrgRole } : null;
  }

  async requireMembership(orgId: string, userId: string): Promise<OrgRole> {
    const m = await this.getMembership(orgId, userId);
    // 404 (not 403) so a non-member cannot even confirm the org exists.
    if (!m) {
      throw new NotFoundException('Organization not found');
    }
    return m.role;
  }

  async requireRole(orgId: string, userId: string, allowed: OrgRole[]): Promise<OrgRole> {
    const role = await this.requireMembership(orgId, userId);
    if (!allowed.includes(role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    return role;
  }

  /** Managers may only act on members at or below their own rank. */
  assertCanActOn(actingRole: OrgRole, targetRole: OrgRole): void {
    if (ORG_ROLE_RANK[targetRole] > ORG_ROLE_RANK[actingRole]) {
      throw new ForbiddenException('Cannot act on a higher-ranked member');
    }
  }

  async assertNotLastSuperadmin(orgId: string): Promise<void> {
    const superCount = await this.prisma.organizationMember.count({
      where: { organizationId: orgId, role: 'SUPERADMIN' },
    });
    if (superCount <= 1) {
      throw new BadRequestException('An organization must keep at least one SUPERADMIN');
    }
  }

  /** Adopt the org as the user's default only if they don't already have one. */
  async adoptAsDefaultIfNone(userId: string, orgId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, defaultOrganizationId: null },
      data: { defaultOrganizationId: orgId },
    });
  }

  isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    );
  }
}
