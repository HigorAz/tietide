import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';

// Both Instagram and WhatsApp connectors call the Meta Graph API with a Bearer
// access token, so they share one client factory. The connection config only
// needs an `accessToken`; provider-specific target ids (ig-user-id /
// phone-number-id) are supplied per node and passed in the request path.
export interface MetaTokenConfig {
  accessToken: string;
}

export interface MetaGraphRequest {
  method?: string;
  searchParams?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export class MetaGraphHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Meta Graph request failed with status ${status}`);
    this.name = 'MetaGraphHttpError';
    this.response = { status, body };
  }
}

@Injectable()
export class MetaGraphClientFactory {
  constructor(private readonly config: ConfigService) {}

  private version(): string {
    const v = this.config.get<string>('META_GRAPH_API_VERSION');
    return v && v.length > 0 ? v : 'v20.0';
  }

  baseUrl(): string {
    const override = this.config.get<string>('META_GRAPH_API_URL');
    if (override && override.length > 0) return override.replace(/\/+$/, '');
    return `https://graph.facebook.com/${this.version()}`;
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<MetaTokenConfig>,
    path: string,
    init: MetaGraphRequest = {},
  ): Promise<{ status: number; data: T }> {
    let url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    if (init.searchParams) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(init.searchParams)) {
        if (typeof v === 'string' && v.length > 0) qs.append(k, v);
      }
      const query = qs.toString();
      if (query.length > 0) url += `?${query}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${connection.config.accessToken}`,
      ...(init.headers ?? {}),
    };
    let body: string | undefined;
    if (init.body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      body = JSON.stringify(init.body);
    }

    const res = await fetch(url, { method: init.method ?? 'GET', headers, body });

    let parsed: unknown = null;
    const text = await res.text();
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }

    if (res.status >= 400) {
      const message =
        parsed &&
        typeof parsed === 'object' &&
        'error' in parsed &&
        parsed.error &&
        typeof parsed.error === 'object' &&
        'message' in parsed.error &&
        typeof (parsed.error as { message: unknown }).message === 'string'
          ? (parsed.error as { message: string }).message
          : `Meta Graph API error (status ${res.status})`;
      throw new MetaGraphHttpError(res.status, parsed, message);
    }

    return { status: res.status, data: parsed as T };
  }
}
