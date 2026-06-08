import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRolesGuard } from './org-roles.guard';

function ctxWith(org: { role: string } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ org }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('OrgRolesGuard', () => {
  let reflector: Reflector;
  let guard: OrgRolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new OrgRolesGuard(reflector);
  });

  it('allows the route when no @OrgRoles metadata is set (any member)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(ctxWith({ role: 'VIEWER' }))).toBe(true);
  });

  it('allows when the active role is in the required set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['SUPERADMIN', 'ADMIN']);

    expect(guard.canActivate(ctxWith({ role: 'ADMIN' }))).toBe(true);
  });

  it('throws Forbidden when the active role is not in the required set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['SUPERADMIN', 'ADMIN']);

    expect(() => guard.canActivate(ctxWith({ role: 'MEMBER' }))).toThrow(ForbiddenException);
  });

  it('throws Forbidden when there is no org context on the request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['SUPERADMIN']);

    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(ForbiddenException);
  });
});
