import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

function makeContext(user?: { role?: string } | null): ExecutionContext {
  const handler = jest.fn();
  const cls = jest.fn();
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ user: user ?? undefined }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  describe('canActivate', () => {
    it('should allow when no @Roles metadata is set on the route', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const ctx = makeContext({ role: 'USER' });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow when an empty roles array is set (acts like no metadata)', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
      const ctx = makeContext({ role: 'USER' });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("should allow an ADMIN user when @Roles('ADMIN') is set", () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const ctx = makeContext({ role: 'ADMIN' });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it("should reject a USER when @Roles('ADMIN') is set", () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const ctx = makeContext({ role: 'USER' });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should reject when request.user is missing entirely', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const ctx = makeContext(null);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should reject when user.role is missing', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const ctx = makeContext({});
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should query metadata via getAllAndOverride with handler + class', () => {
      const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const ctx = makeContext({ role: 'ADMIN' });
      guard.canActivate(ctx);
      expect(spy).toHaveBeenCalledWith(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    });
  });
});
