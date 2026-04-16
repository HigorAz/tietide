import type { ConfigService } from '@nestjs/config';
import { JwtStrategy, type JwtPayload } from './jwt.strategy';

describe('JwtStrategy', () => {
  describe('constructor', () => {
    it('should read JWT_SECRET from config via getOrThrow', () => {
      const config = { getOrThrow: jest.fn().mockReturnValue('s3cret') };
      new JwtStrategy(config as unknown as ConfigService);

      expect(config.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
    });

    it('should propagate config.getOrThrow errors when JWT_SECRET is missing', () => {
      const config = {
        getOrThrow: jest.fn(() => {
          throw new Error('Missing JWT_SECRET');
        }),
      };

      expect(() => new JwtStrategy(config as unknown as ConfigService)).toThrow(
        'Missing JWT_SECRET',
      );
    });
  });

  describe('validate', () => {
    let strategy: JwtStrategy;

    beforeEach(() => {
      const config = { getOrThrow: jest.fn().mockReturnValue('s3cret') };
      strategy = new JwtStrategy(config as unknown as ConfigService);
    });

    it('should map sub→id and return { id, email, role } for a USER payload', () => {
      const payload: JwtPayload = { sub: 'user-1', email: 'alice@example.com', role: 'USER' };

      const result = strategy.validate(payload);

      expect(result).toEqual({ id: 'user-1', email: 'alice@example.com', role: 'USER' });
    });

    it('should not leak the sub claim in the returned user shape', () => {
      const payload: JwtPayload = { sub: 'user-1', email: 'a@b.com', role: 'USER' };

      const result = strategy.validate(payload);

      expect(result).not.toHaveProperty('sub');
    });

    it('should preserve the ADMIN role as-is', () => {
      const payload: JwtPayload = { sub: 'u', email: 'admin@example.com', role: 'ADMIN' };

      const result = strategy.validate(payload);

      expect(result.role).toBe('ADMIN');
    });
  });
});
