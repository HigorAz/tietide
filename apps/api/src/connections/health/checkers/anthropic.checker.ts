import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpHealthChecker } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

@Injectable()
export class AnthropicHealthChecker extends BaseHttpHealthChecker {
  readonly provider = 'anthropic';

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {
    super();
  }

  static fromConfig(config: ConfigService): AnthropicHealthChecker {
    const base = config.get<string>('ANTHROPIC_BASE_URL') ?? DEFAULT_BASE_URL;
    return new AnthropicHealthChecker(base.replace(/\/+$/, ''));
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { apiKey?: unknown };
    if (typeof cfg.apiKey !== 'string' || cfg.apiKey.length === 0) {
      return { ok: false, message: 'Missing apiKey in stored config', latencyMs: 0 };
    }
    return this.perform(
      {
        url: `${this.baseUrl}/v1/models`,
        headers: {
          'x-api-key': cfg.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
      },
      signal,
    );
  }
}
