import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpHealthChecker } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';

const DEFAULT_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

@Injectable()
export class GoogleHealthChecker extends BaseHttpHealthChecker {
  readonly provider = 'google';

  constructor(private readonly userinfoUrl: string = DEFAULT_USERINFO_URL) {
    super();
  }

  static fromConfig(config: ConfigService): GoogleHealthChecker {
    const url = config.get<string>('GOOGLE_USERINFO_URL') ?? DEFAULT_USERINFO_URL;
    return new GoogleHealthChecker(url);
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { accessToken?: unknown };
    if (typeof cfg.accessToken !== 'string' || cfg.accessToken.length === 0) {
      return { ok: false, message: 'Missing accessToken in stored config', latencyMs: 0 };
    }
    return this.perform(
      {
        url: this.userinfoUrl,
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      },
      signal,
    );
  }
}
