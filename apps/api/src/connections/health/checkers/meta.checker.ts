import { ConfigService } from '@nestjs/config';
import { BaseHttpHealthChecker } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';

// Both Instagram and WhatsApp connections hold a Meta Graph token; the cheapest
// validity probe is GET /me, which any valid user token can call.
function resolveBaseUrl(config: ConfigService): string {
  const version = config.get<string>('META_GRAPH_API_VERSION') ?? 'v20.0';
  const base = config.get<string>('META_GRAPH_API_URL') ?? `https://graph.facebook.com/${version}`;
  return base.replace(/\/+$/, '');
}

abstract class MetaHealthChecker extends BaseHttpHealthChecker {
  constructor(protected readonly baseUrl: string) {
    super();
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { accessToken?: unknown };
    if (typeof cfg.accessToken !== 'string' || cfg.accessToken.length === 0) {
      return { ok: false, message: 'Missing accessToken in stored config', latencyMs: 0 };
    }
    return this.perform(
      { url: `${this.baseUrl}/me`, headers: { Authorization: `Bearer ${cfg.accessToken}` } },
      signal,
    );
  }
}

export class InstagramHealthChecker extends MetaHealthChecker {
  readonly provider = 'instagram';

  static fromConfig(config: ConfigService): InstagramHealthChecker {
    return new InstagramHealthChecker(resolveBaseUrl(config));
  }
}

export class WhatsappHealthChecker extends MetaHealthChecker {
  readonly provider = 'whatsapp';

  static fromConfig(config: ConfigService): WhatsappHealthChecker {
    return new WhatsappHealthChecker(resolveBaseUrl(config));
  }
}
