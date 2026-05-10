import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { CalendlyApiKeyConfig } from '@tietide/shared';

const DEFAULT_CALENDLY_BASE_URL = 'https://api.calendly.com';

export interface CalendlyFetchInit {
  method?: string;
  body?: BodyInit | null;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface CalendlyResponse<T = unknown> {
  status: number;
  data: T;
}

export class CalendlyHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Calendly request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class CalendlyClientFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('CALENDLY_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_CALENDLY_BASE_URL;
    return base.replace(/\/+$/, '');
  }

  buildAuthHeaders(connection: DecryptedConnection<CalendlyApiKeyConfig>): Record<string, string> {
    return { Authorization: `Bearer ${connection.config.apiKey}` };
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<CalendlyApiKeyConfig>,
    path: string,
    init: CalendlyFetchInit = {},
  ): Promise<CalendlyResponse<T>> {
    const search = init.query ? `?${new URLSearchParams(init.query).toString()}` : '';
    const url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}${search}`;
    const headers: Record<string, string> = {
      ...this.buildAuthHeaders(connection),
      ...(init.headers ?? {}),
    };
    if (init.body !== undefined && init.body !== null && headers['Content-Type'] === undefined) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }

    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body ?? undefined,
    });

    let body: unknown = null;
    const text = await res.text();
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }

    if (res.status >= 400) {
      const message =
        body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
          ? body.message
          : `Calendly API error (status ${res.status})`;
      throw new CalendlyHttpError(res.status, body, message);
    }

    return { status: res.status, data: body as T };
  }
}
