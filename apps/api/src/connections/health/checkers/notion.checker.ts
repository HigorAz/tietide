import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpHealthChecker } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';

const DEFAULT_BASE_URL = 'https://api.notion.com';
const NOTION_VERSION = '2022-06-28';

@Injectable()
export class NotionHealthChecker extends BaseHttpHealthChecker {
  readonly provider = 'notion';

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {
    super();
  }

  static fromConfig(config: ConfigService): NotionHealthChecker {
    const base = config.get<string>('NOTION_BASE_URL') ?? DEFAULT_BASE_URL;
    return new NotionHealthChecker(base.replace(/\/+$/, ''));
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { accessToken?: unknown };
    if (typeof cfg.accessToken !== 'string' || cfg.accessToken.length === 0) {
      return { ok: false, message: 'Missing accessToken in stored config', latencyMs: 0 };
    }
    return this.perform(
      {
        url: `${this.baseUrl}/v1/users/me`,
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          'Notion-Version': NOTION_VERSION,
        },
      },
      signal,
    );
  }
}
