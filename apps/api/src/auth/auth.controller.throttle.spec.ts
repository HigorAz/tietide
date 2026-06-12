import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AUTH_THROTTLER_NAME } from '../common/throttler/throttler.config';

// W5.50: the authenticated PATCH /v1/auth/password (changePassword) route runs an
// online bcrypt.compare against the current password — an attacker who has stolen a
// valid session can brute-force the current password through it. Every other
// credential route opts into the auth-tier throttle (~5/min); changePassword must
// too, otherwise it falls back to the 100/min global default and is the soft spot
// for a session-bound online guessing attack.
describe('AuthController', () => {
  describe('changePassword (PATCH /auth/password)', () => {
    it('opts into the auth-tier throttle so current-password guessing is bounded', () => {
      const reflector = new Reflector();

      // @Throttle({ auth: { ... } }) stores the per-route limit under
      // THROTTLER:LIMIT<name>. Its absence means the route falls back to the
      // 100/min global default (the W5.50 bug).
      const authLimit = reflector.getAllAndOverride(`THROTTLER:LIMIT${AUTH_THROTTLER_NAME}`, [
        AuthController.prototype.changePassword,
        AuthController,
      ]);

      expect(authLimit).toBeDefined();
    });
  });
});
