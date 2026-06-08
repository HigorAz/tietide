import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtStrategy, type JwtPayload } from './jwt.strategy';
import type { PrismaService } from '../../prisma/prisma.service';

function makeConfig() {
  return { getOrThrow: jest.fn().mockReturnValue('s3cret') };
}

function makePrisma(user: unknown) {
  return { user: { findUnique: jest.fn().mockResolvedValue(user) } };
}

function makeStrategy(prisma: ReturnType<typeof makePrisma>, config = makeConfig()) {
  return new JwtStrategy(config as unknown as ConfigService, prisma as unknown as PrismaService);
}

describe('JwtStrategy', () => {
  describe('constructor', () => {
    it('should read JWT_SECRET from config via getOrThrow', () => {
      const config = makeConfig();
      makeStrategy(makePrisma(null), config);

      expect(config.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
    });

    it('should propagate config.getOrThrow errors when JWT_SECRET is missing', () => {
      const config = {
        getOrThrow: jest.fn(() => {
          throw new Error('Missing JWT_SECRET');
        }),
      };

      expect(() => makeStrategy(makePrisma(null), config)).toThrow('Missing JWT_SECRET');
    });
  });

  describe('validate', () => {
    it('returns { id, email, role } when the token version matches the stored user', async () => {
      const strategy = makeStrategy(
        makePrisma({ id: 'user-1', email: 'alice@example.com', role: 'USER', tokenVersion: 0 }),
      );
      const payload: JwtPayload = {
        sub: 'user-1',
        email: 'alice@example.com',
        role: 'USER',
        tokenVersion: 0,
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({ id: 'user-1', email: 'alice@example.com', role: 'USER' });
    });

    it('treats a token with no tokenVersion claim as version 0 (legacy token compat)', async () => {
      const strategy = makeStrategy(
        makePrisma({ id: 'user-1', email: 'a@b.com', role: 'USER', tokenVersion: 0 }),
      );

      const result = await strategy.validate({ sub: 'user-1', email: 'a@b.com', role: 'USER' });

      expect(result).toEqual({ id: 'user-1', email: 'a@b.com', role: 'USER' });
    });

    it('does not leak the sub claim in the returned user shape', async () => {
      const strategy = makeStrategy(
        makePrisma({ id: 'user-1', email: 'a@b.com', role: 'USER', tokenVersion: 0 }),
      );

      const result = await strategy.validate({
        sub: 'user-1',
        email: 'a@b.com',
        role: 'USER',
        tokenVersion: 0,
      });

      expect(result).not.toHaveProperty('sub');
    });

    it('uses the live DB role, not the (possibly stale) role inside the token', async () => {
      // Token minted while the user was ADMIN; they have since been demoted.
      const strategy = makeStrategy(
        makePrisma({ id: 'user-1', email: 'a@b.com', role: 'USER', tokenVersion: 0 }),
      );

      const result = await strategy.validate({
        sub: 'user-1',
        email: 'a@b.com',
        role: 'ADMIN',
        tokenVersion: 0,
      });

      expect(result.role).toBe('USER');
    });

    it('rejects when the user no longer exists', async () => {
      const strategy = makeStrategy(makePrisma(null));

      await expect(
        strategy.validate({ sub: 'gone', email: 'a@b.com', role: 'USER', tokenVersion: 0 }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the token version is stale (token has been revoked)', async () => {
      const strategy = makeStrategy(
        makePrisma({ id: 'user-1', email: 'a@b.com', role: 'USER', tokenVersion: 5 }),
      );

      await expect(
        strategy.validate({ sub: 'user-1', email: 'a@b.com', role: 'USER', tokenVersion: 4 }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a soft-deleted (anonymized) user even with a matching token version', async () => {
      const strategy = makeStrategy(
        makePrisma({
          id: 'user-1',
          email: 'a@b.com',
          role: 'USER',
          tokenVersion: 0,
          deletedAt: new Date('2026-06-08T00:00:00Z'),
        }),
      );

      await expect(
        strategy.validate({ sub: 'user-1', email: 'a@b.com', role: 'USER', tokenVersion: 0 }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects tokens with the oauth-state audience claim before any DB lookup', async () => {
      const prisma = makePrisma(null);
      const strategy = makeStrategy(prisma);

      await expect(
        strategy.validate({ sub: 'user-1', email: 'a@b.com', role: 'USER', aud: 'oauth-state' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects tokens missing required identity claims before any DB lookup', async () => {
      const prisma = makePrisma(null);
      const strategy = makeStrategy(prisma);

      await expect(strategy.validate({ aud: 'something' })).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
