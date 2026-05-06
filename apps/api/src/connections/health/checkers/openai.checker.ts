import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpHealthChecker } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';

const DEFAULT_BASE_URL = 'https://api.openai.com';

@Injectable()
export class OpenAIHealthChecker extends BaseHttpHealthChecker {
  readonly provider = 'openai';

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {
    super();
  }

  static fromConfig(config: ConfigService): OpenAIHealthChecker {
    const base = config.get<string>('OPENAI_BASE_URL') ?? DEFAULT_BASE_URL;
    return new OpenAIHealthChecker(base.replace(/\/+$/, ''));
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { apiKey?: unknown; organization?: unknown };
    if (typeof cfg.apiKey !== 'string' || cfg.apiKey.length === 0) {
      return { ok: false, message: 'Missing apiKey in stored config', latencyMs: 0 };
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${cfg.apiKey}` };
    if (typeof cfg.organization === 'string' && cfg.organization.length > 0) {
      headers['OpenAI-Organization'] = cfg.organization;
    }
    return this.perform({ url: `${this.baseUrl}/v1/models`, headers }, signal);
  }
}
