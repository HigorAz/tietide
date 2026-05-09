import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpHealthChecker } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';

const DEFAULT_BASE_URL = 'https://api.trello.com';

@Injectable()
export class TrelloHealthChecker extends BaseHttpHealthChecker {
  readonly provider = 'trello';

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {
    super();
  }

  static fromConfig(config: ConfigService): TrelloHealthChecker {
    const base = config.get<string>('TRELLO_BASE_URL') ?? DEFAULT_BASE_URL;
    return new TrelloHealthChecker(base.replace(/\/+$/, ''));
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { apiKey?: unknown; token?: unknown };
    if (typeof cfg.apiKey !== 'string' || cfg.apiKey.length === 0) {
      return { ok: false, message: 'Missing apiKey in stored config', latencyMs: 0 };
    }
    if (typeof cfg.token !== 'string' || cfg.token.length === 0) {
      return { ok: false, message: 'Missing token in stored config', latencyMs: 0 };
    }
    const url = new URL(`${this.baseUrl}/1/members/me`);
    url.searchParams.set('key', cfg.apiKey);
    url.searchParams.set('token', cfg.token);
    return this.perform({ url: url.toString(), headers: {} }, signal);
  }
}
