import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpHealthChecker } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';

const DEFAULT_BASE_URL = 'https://graph.microsoft.com';

@Injectable()
export class MicrosoftHealthChecker extends BaseHttpHealthChecker {
  readonly provider = 'microsoft';

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {
    super();
  }

  static fromConfig(config: ConfigService): MicrosoftHealthChecker {
    const base = config.get<string>('MICROSOFT_GRAPH_URL') ?? DEFAULT_BASE_URL;
    return new MicrosoftHealthChecker(base.replace(/\/+$/, ''));
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { accessToken?: unknown };
    if (typeof cfg.accessToken !== 'string' || cfg.accessToken.length === 0) {
      return { ok: false, message: 'Missing accessToken in stored config', latencyMs: 0 };
    }
    return this.perform(
      {
        url: `${this.baseUrl}/v1.0/me`,
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      },
      signal,
    );
  }
}
