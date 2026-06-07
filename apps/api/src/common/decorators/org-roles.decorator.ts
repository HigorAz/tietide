import { SetMetadata } from '@nestjs/common';
import type { OrgRole } from '@tietide/shared';

export const ORG_ROLES_KEY = 'orgRoles';

/**
 * Restricts a route (or controller) to members holding one of the given org roles.
 * Enforced by `OrgRolesGuard`, which reads the role from `request.org` (set by
 * `OrgContextGuard`). Example: `@OrgRoles('SUPERADMIN', 'ADMIN')`.
 */
export const OrgRoles = (...roles: OrgRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ORG_ROLES_KEY, roles);
