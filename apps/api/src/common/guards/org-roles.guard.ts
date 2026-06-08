import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OrgRole } from '@tietide/shared';
import { ORG_ROLES_KEY } from '../decorators/org-roles.decorator';
import type { OrgContext } from '../org-context/org-context.types';

/**
 * Enforces `@OrgRoles(...)` against the active org role resolved by
 * `OrgContextGuard`. Routes with no `@OrgRoles` metadata are allowed (any member).
 * Must run AFTER `OrgContextGuard`.
 */
@Injectable()
export class OrgRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<OrgRole[] | undefined>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ org?: OrgContext }>();
    const role = request.org?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Insufficient organization role');
    }

    return true;
  }
}
