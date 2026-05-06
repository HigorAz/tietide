import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpHealthChecker, extractErrorMessage } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';

const DEFAULT_BASE_URL = 'https://slack.com';

@Injectable()
export class SlackHealthChecker extends BaseHttpHealthChecker {
  readonly provider = 'slack';

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {
    super();
  }

  static fromConfig(config: ConfigService): SlackHealthChecker {
    const base = config.get<string>('SLACK_BASE_URL') ?? DEFAULT_BASE_URL;
    return new SlackHealthChecker(base.replace(/\/+$/, ''));
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { accessToken?: unknown };
    if (typeof cfg.accessToken !== 'string' || cfg.accessToken.length === 0) {
      return { ok: false, message: 'Missing accessToken in stored config', latencyMs: 0 };
    }
    return this.perform(
      {
        url: `${this.baseUrl}/api/auth.test`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
      signal,
      async (res) => {
        if (!res.ok) {
          return { ok: false, message: `${res.status} ${await extractErrorMessage(res)}` };
        }
        const body = (await res.json()) as { ok?: boolean; error?: string };
        if (body.ok === true) return { ok: true };
        return { ok: false, message: body.error ?? 'Slack reported ok=false' };
      },
    );
  }
}
