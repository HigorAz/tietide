import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpHealthChecker } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';

const DEFAULT_BASE_URL = 'https://api.airtable.com';

@Injectable()
export class AirtableHealthChecker extends BaseHttpHealthChecker {
  readonly provider = 'airtable';

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {
    super();
  }

  static fromConfig(config: ConfigService): AirtableHealthChecker {
    const base = config.get<string>('AIRTABLE_BASE_URL') ?? DEFAULT_BASE_URL;
    return new AirtableHealthChecker(base.replace(/\/+$/, ''));
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { apiKey?: unknown };
    if (typeof cfg.apiKey !== 'string' || cfg.apiKey.length === 0) {
      return { ok: false, message: 'Missing apiKey in stored config', latencyMs: 0 };
    }
    return this.perform(
      {
        url: `${this.baseUrl}/v0/meta/whoami`,
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      },
      signal,
    );
  }
}
