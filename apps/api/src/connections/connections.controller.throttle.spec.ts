import { Reflector } from '@nestjs/core';
import { ConnectionsController } from './connections.controller';
import { EXECUTE_THROTTLER_NAME } from '../common/throttler/throttler.config';

// W5.37: the authenticated POST /v1/connections/:id/test route performs an
// outbound provider HTTP call (a credential health probe). Relying only on the
// 100/min global default is an amplification mismatch: one cheap inbound call
// triggers a heavier outbound call. It must opt into the execute-tier throttle
// (~20/min), the same cap used by workflow execute/test routes.
describe('ConnectionsController', () => {
  describe('test (POST :id/test)', () => {
    it('opts into the execute-tier throttle so the outbound probe is not under-throttled', () => {
      const reflector = new Reflector();

      // @Throttle({ execute: { ... } }) stores the per-route limit under
      // THROTTLER:LIMIT<name>. Its absence means the route falls back to the
      // 100/min global default (the W5.37 bug).
      const executeLimit = reflector.getAllAndOverride(`THROTTLER:LIMIT${EXECUTE_THROTTLER_NAME}`, [
        ConnectionsController.prototype.test,
        ConnectionsController,
      ]);

      expect(executeLimit).toBeDefined();
    });
  });
});
