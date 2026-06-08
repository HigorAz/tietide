import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ORG_ROLE_RANK, type OrgRole } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { OrganizationAccessService } from './organization-access.service';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';
import type { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import type { OrganizationResponseDto } from './dto/organization-response.dto';
import type { OrganizationSummaryDto } from './dto/organization-summary.dto';
import type { OrgMemberResponseDto } from './dto/org-member-response.dto';

const MAX_SLUG_ATTEMPTS = 5;
const MANAGER_ROLES: OrgRole[] = ['SUPERADMIN', 'ADMIN'];

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly access: OrganizationAccessService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto): Promise<OrganizationSummaryDto> {
    const org = await this.createWithUniqueSlug(userId, dto.name);

    await this.access.adoptAsDefaultIfNone(userId, org.id);
    await this.audit.log({
      userId,
      organizationId: org.id,
      action: 'org.create',
      resource: 'organization',
      resourceId: org.id,
      metadata: { name: org.name },
    });

    return { id: org.id, name: org.name, slug: org.slug, role: 'SUPERADMIN' };
  }

  async listForUser(userId: string): Promise<OrganizationSummaryDto[]> {
    const rows = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.organization.id,
      name: r.organization.name,
      slug: r.organization.slug,
      role: r.role as OrgRole,
    }));
  }

  async findOne(orgId: string, userId: string): Promise<OrganizationResponseDto> {
    await this.access.requireMembership(orgId, userId);
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async rename(
    orgId: string,
    userId: string,
    dto: UpdateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    await this.access.requireRole(orgId, userId, ['SUPERADMIN']);
    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: { name: dto.name },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
    await this.audit.log({
      userId,
      organizationId: orgId,
      action: 'org.rename',
      resource: 'organization',
      resourceId: orgId,
      metadata: { name: dto.name },
    });
    return org;
  }

  async remove(orgId: string, userId: string): Promise<void> {
    await this.access.requireRole(orgId, userId, ['SUPERADMIN']);
    const myOrgCount = await this.prisma.organizationMember.count({ where: { userId } });
    if (myOrgCount <= 1) {
      throw new BadRequestException('You cannot delete your only workspace');
    }
    await this.prisma.organization.delete({ where: { id: orgId } });
    await this.audit.log({
      userId,
      organizationId: orgId,
      action: 'org.delete',
      resource: 'organization',
      resourceId: orgId,
    });
  }

  async listMembers(orgId: string, userId: string): Promise<OrgMemberResponseDto[]> {
    await this.access.requireMembership(orgId, userId);
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      select: {
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      userId: r.userId,
      email: r.user.email,
      name: r.user.name,
      role: r.role as OrgRole,
      createdAt: r.createdAt,
    }));
  }

  async changeMemberRole(
    orgId: string,
    actingUserId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<OrgMemberResponseDto> {
    const actingRole = await this.access.requireRole(orgId, actingUserId, MANAGER_ROLES);
    const target = await this.access.getMembership(orgId, targetUserId);
    if (!target) {
      throw new NotFoundException('Member not found');
    }
    this.access.assertCanActOn(actingRole, target.role);
    if (ORG_ROLE_RANK[dto.role] > ORG_ROLE_RANK[actingRole]) {
      throw new ForbiddenException('Cannot assign a role above your own');
    }
    if (target.role === 'SUPERADMIN' && dto.role !== 'SUPERADMIN') {
      await this.access.assertNotLastSuperadmin(orgId);
    }

    const updated = await this.prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: orgId, userId: targetUserId } },
      data: { role: dto.role },
      select: {
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
    });
    await this.audit.log({
      userId: actingUserId,
      organizationId: orgId,
      action: 'org.member.role_change',
      resource: 'organization-member',
      resourceId: targetUserId,
      metadata: { from: target.role, to: dto.role },
    });
    return {
      userId: updated.userId,
      email: updated.user.email,
      name: updated.user.name,
      role: updated.role as OrgRole,
      createdAt: updated.createdAt,
    };
  }

  async removeMember(orgId: string, actingUserId: string, targetUserId: string): Promise<void> {
    const actingRole = await this.access.requireRole(orgId, actingUserId, MANAGER_ROLES);
    const target = await this.access.getMembership(orgId, targetUserId);
    if (!target) {
      throw new NotFoundException('Member not found');
    }
    this.access.assertCanActOn(actingRole, target.role);
    if (target.role === 'SUPERADMIN') {
      await this.access.assertNotLastSuperadmin(orgId);
    }

    await this.prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId: orgId, userId: targetUserId } },
    });
    await this.audit.log({
      userId: actingUserId,
      organizationId: orgId,
      action: 'org.member.remove',
      resource: 'organization-member',
      resourceId: targetUserId,
    });
  }

  private async createWithUniqueSlug(
    userId: string,
    name: string,
  ): Promise<{ id: string; name: string; slug: string; createdAt: Date }> {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = this.generateSlug(name);
      try {
        return await this.prisma.$transaction(async (tx) => {
          const created = await tx.organization.create({
            data: { name, slug, createdById: userId },
            select: { id: true, name: true, slug: true, createdAt: true },
          });
          await tx.organizationMember.create({
            data: { organizationId: created.id, userId, role: 'SUPERADMIN' },
          });
          return created;
        });
      } catch (err) {
        if (this.access.isUniqueViolation(err) && attempt < MAX_SLUG_ATTEMPTS - 1) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not allocate a unique workspace slug');
  }

  private generateSlug(name: string): string {
    const base =
      name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'workspace';
    return `${base}-${randomBytes(3).toString('hex')}`;
  }
}
