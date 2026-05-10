import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { HubspotOAuth2Config } from '@tietide/shared';

const DEFAULT_HUBSPOT_BASE_URL = 'https://api.hubapi.com';

export interface HubspotFetchInit {
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
}

export interface HubspotResponse<T = unknown> {
  status: number;
  data: T;
}

export class HubspotHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `HubSpot request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class HubspotClientFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('HUBSPOT_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_HUBSPOT_BASE_URL;
    return base.replace(/\/+$/, '');
  }

  buildAuthHeaders(connection: DecryptedConnection<HubspotOAuth2Config>): Record<string, string> {
    return { Authorization: `Bearer ${connection.config.accessToken}` };
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<HubspotOAuth2Config>,
    path: string,
    init: HubspotFetchInit = {},
  ): Promise<HubspotResponse<T>> {
    const url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
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
          : `HubSpot API error (status ${res.status})`;
      throw new HubspotHttpError(res.status, body, message);
    }

    return { status: res.status, data: body as T };
  }
}
