import { Injectable } from '@nestjs/common';
import type { ProviderHealthChecker, ProviderHealthResult } from '../provider-health.types';

// An HTTP connection holds reusable auth credentials but targets no fixed host,
// so there is no canonical endpoint to ping. Rather than 404 the Test button (as
// an unregistered provider would), we validate the stored shape and report that
// the credential is exercised at request time by the HTTP Request node.
@Injectable()
export class HttpHealthChecker implements ProviderHealthChecker {
  readonly provider = 'http';

  async check(config: unknown, _signal?: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { authType?: unknown };
    const valid =
      cfg.authType === 'bearer' || cfg.authType === 'apiKey' || cfg.authType === 'basic';
    if (!valid) {
      return { ok: false, message: 'Stored config is missing a valid authType', latencyMs: 0 };
    }
    return {
      ok: true,
      message: 'Credentials are applied when the HTTP Request node runs.',
      latencyMs: 0,
    };
  }
}
