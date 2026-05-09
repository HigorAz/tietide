import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { AirtableApiKeyConfig } from '@tietide/shared';

const DEFAULT_AIRTABLE_BASE_URL = 'https://api.airtable.com';

export interface AirtableFetchInit {
  method?: string;
  body?: BodyInit | null;
  query?: Record<string, string | number | boolean | string[] | undefined>;
  headers?: Record<string, string>;
}

export interface AirtableResponse<T = unknown> {
  status: number;
  data: T;
}

export class AirtableHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Airtable request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class AirtableClientFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('AIRTABLE_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_AIRTABLE_BASE_URL;
    return base.replace(/\/+$/, '');
  }

  buildAuthHeader(connection: DecryptedConnection<AirtableApiKeyConfig>): {
    Authorization: string;
  } {
    return { Authorization: `Bearer ${connection.config.apiKey}` };
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<AirtableApiKeyConfig>,
    path: string,
    init: AirtableFetchInit = {},
  ): Promise<AirtableResponse<T>> {
    const url = new URL(`${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`);
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          for (const item of v) url.searchParams.append(`${k}[]`, item);
        } else {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      ...this.buildAuthHeader(connection),
      ...(init.headers ?? {}),
    };
    if (init.body !== undefined && init.body !== null && headers['Content-Type'] === undefined) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }

    const res = await fetch(url.toString(), {
      method: init.method ?? 'GET',
      headers,
      body: init.body ?? undefined,
    });

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (res.status >= 400) {
      const errMsg = (body as { error?: { message?: unknown } } | null)?.error?.message;
      const message =
        typeof errMsg === 'string' ? errMsg : `Airtable API error (status ${res.status})`;
      throw new AirtableHttpError(res.status, body, message);
    }

    return { status: res.status, data: body as T };
  }
}
