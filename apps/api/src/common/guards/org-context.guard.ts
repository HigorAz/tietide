import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { OrgContext } from '../org-context/org-context.types';

const ORG_HEADER = 'x-org-id';

interface OrgAwareRequest {
  user?: { id: string };
  headers: Record<string, string | string[] | undefined>;
  org?: OrgContext;
}

/**
 * Resolves the active organization for a request and attaches it to `request.org`.
 *
 * - Reads the `X-Org-Id` header; if present, the caller MUST be a member of that
 *   org (else 403) — this is what prevents cross-org IDOR. The org id comes from a
 *   validated header, never from the request body.
 * - If the header is absent, falls back to the caller's `defaultOrganizationId`,
 *   then to their earliest membership.
 *
 * Must run AFTER `JwtAuthGuard` (it relies on `request.user`).
 */
@Injectable()
export class OrgContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrgAwareRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const headerVal = request.headers[ORG_HEADER];
    const requestedOrgId = (Array.isArray(headerVal) ? headerVal[0] : headerVal)?.trim() || null;

    let membership: { organizationId: string; role: OrgContext['role'] } | null = null;

    if (requestedOrgId) {
      membership = await this.prisma.organizationMember.findFirst({
        where: { organizationId: requestedOrgId, userId: user.id },
        select: { organizationId: true, role: true },
      });
      if (!membership) {
        throw new ForbiddenException('Not a member of this organization');
      }
    } else {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { defaultOrganizationId: true },
      });
      if (dbUser?.defaultOrganizationId) {
        membership = await this.prisma.organizationMember.findFirst({
          where: { organizationId: dbUser.defaultOrganizationId, userId: user.id },
          select: { organizationId: true, role: true },
        });
      }
      membership ??= await this.prisma.organizationMember.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: { organizationId: true, role: true },
      });
      if (!membership) {
        throw new ForbiddenException('No organization context');
      }
    }

    request.org = { id: membership.organizationId, role: membership.role };
    return true;
  }
}
