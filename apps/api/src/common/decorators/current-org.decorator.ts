import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { OrgContext } from '../org-context/org-context.types';

/**
 * Injects the active organization context resolved by `OrgContextGuard`.
 * `@CurrentOrg()` → `{ id, role }`; `@CurrentOrg('id')` → the org id.
 */
export const CurrentOrg = createParamDecorator(
  (
    data: keyof OrgContext | undefined,
    ctx: ExecutionContext,
  ): OrgContext | OrgContext[keyof OrgContext] => {
    const request = ctx.switchToHttp().getRequest<{ org: OrgContext }>();
    const org = request.org;
    return data ? org[data] : org;
  },
);
