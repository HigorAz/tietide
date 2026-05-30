import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwtStrategy, type AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

interface StubUser {
  id: string;
  email: string;
  role: string;
  tokenVersion: number;
}

describe('JwtAuthGuard (integration)', () => {
  let guard: JwtAuthGuard;
  const jwtSecret = 'test-secret-key';

  // JwtStrategy now re-fetches the user (tokenVersion revocation check). The
  // stub returns whatever user the test registered for the looked-up id, so the
  // guard still exercises the real verify -> validate -> request.user path.
  const usersById = new Map<string, StubUser>();
  const prismaStub = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(usersById.get(where.id) ?? null),
      ),
    },
  };

  const makeContext = (authorization?: string): ExecutionContext => {
    const req = { headers: authorization ? { authorization } : {} };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    process.env.JWT_SECRET = jwtSecret;
    usersById.clear();
    prismaStub.user.findUnique.mockClear();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: jwtSecret }),
      ],
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: prismaStub },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    guard = moduleRef.get(JwtAuthGuard);
  });

  describe('canActivate', () => {
    it('allows a request carrying a valid Bearer token', async () => {
      usersById.set('u1', { id: 'u1', email: 'a@b.com', role: 'USER', tokenVersion: 0 });
      const token = jwt.sign({ sub: 'u1', email: 'a@b.com', role: 'USER' }, jwtSecret);
      const ctx = makeContext(`Bearer ${token}`);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('rejects a request with no Authorization header', async () => {
      const ctx = makeContext();

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      const token = jwt.sign({ sub: 'u', email: 'a@b.com', role: 'USER' }, jwtSecret, {
        expiresIn: '-1h',
      });
      const ctx = makeContext(`Bearer ${token}`);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token signed with a different secret', async () => {
      const token = jwt.sign({ sub: 'u', email: 'a@b.com', role: 'USER' }, 'different-secret');
      const ctx = makeContext(`Bearer ${token}`);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token whose user has been revoked (tokenVersion bumped)', async () => {
      usersById.set('u1', { id: 'u1', email: 'a@b.com', role: 'USER', tokenVersion: 1 });
      // Token was minted at version 0; the user has since logged out (now 1).
      const token = jwt.sign(
        { sub: 'u1', email: 'a@b.com', role: 'USER', tokenVersion: 0 },
        jwtSecret,
      );
      const ctx = makeContext(`Bearer ${token}`);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('populates request.user with id, email, role on success', async () => {
      usersById.set('u-42', {
        id: 'u-42',
        email: 'mc@example.com',
        role: 'ADMIN',
        tokenVersion: 0,
      });
      const token = jwt.sign({ sub: 'u-42', email: 'mc@example.com', role: 'ADMIN' }, jwtSecret);
      const ctx = makeContext(`Bearer ${token}`);

      await guard.canActivate(ctx);
      const req = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();

      expect(req.user).toEqual({ id: 'u-42', email: 'mc@example.com', role: 'ADMIN' });
    });

    it('rejects a malformed token string', async () => {
      const ctx = makeContext('Bearer not.a.jwt');

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });
});
