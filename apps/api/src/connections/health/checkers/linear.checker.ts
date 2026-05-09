import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpHealthChecker, extractErrorMessage } from './base-http.checker';
import type { ProviderHealthResult } from '../provider-health.types';

const DEFAULT_BASE_URL = 'https://api.linear.app/graphql';

@Injectable()
export class LinearHealthChecker extends BaseHttpHealthChecker {
  readonly provider = 'linear';

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {
    super();
  }

  static fromConfig(config: ConfigService): LinearHealthChecker {
    const base = config.get<string>('LINEAR_BASE_URL') ?? DEFAULT_BASE_URL;
    return new LinearHealthChecker(base);
  }

  async check(config: unknown, signal: AbortSignal): Promise<ProviderHealthResult> {
    const cfg = config as { apiKey?: unknown };
    if (typeof cfg.apiKey !== 'string' || cfg.apiKey.length === 0) {
      return { ok: false, message: 'Missing apiKey in stored config', latencyMs: 0 };
    }
    return this.perform(
      {
        url: this.baseUrl,
        method: 'POST',
        headers: {
          Authorization: cfg.apiKey,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ query: '{ viewer { id } }' }),
      },
      signal,
      // Linear returns HTTP 200 with `errors[]` for auth failures.
      async (res) => {
        if (!res.ok) {
          return { ok: false, message: `${res.status} ${await extractErrorMessage(res)}` };
        }
        try {
          const body = (await res.json()) as { errors?: Array<{ message?: string }> };
          if (Array.isArray(body.errors) && body.errors.length > 0) {
            const msg = body.errors[0]?.message ?? 'Linear GraphQL error';
            return { ok: false, message: msg };
          }
        } catch {
          return { ok: false, message: 'Malformed Linear response' };
        }
        return { ok: true };
      },
    );
  }
}
