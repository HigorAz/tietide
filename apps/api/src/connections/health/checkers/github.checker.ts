import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpHealthChecker } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';

const DEFAULT_BASE_URL = 'https://api.github.com';

@Injectable()
export class GitHubHealthChecker extends BaseHttpHealthChecker {
  readonly provider = 'github';

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {
    super();
  }

  static fromConfig(config: ConfigService): GitHubHealthChecker {
    const base = config.get<string>('GITHUB_BASE_URL') ?? DEFAULT_BASE_URL;
    return new GitHubHealthChecker(base.replace(/\/+$/, ''));
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { apiKey?: unknown };
    if (typeof cfg.apiKey !== 'string' || cfg.apiKey.length === 0) {
      return { ok: false, message: 'Missing apiKey in stored config', latencyMs: 0 };
    }
    return this.perform(
      {
        url: `${this.baseUrl}/user`,
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      signal,
    );
  }
}
