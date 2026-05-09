import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { TrelloApiKeyConfig } from '@tietide/shared';

const DEFAULT_TRELLO_BASE_URL = 'https://api.trello.com';

export interface TrelloFetchInit {
  method?: string;
  body?: BodyInit | null;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

export interface TrelloResponse<T = unknown> {
  status: number;
  data: T;
}

export class TrelloHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Trello request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class TrelloClientFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('TRELLO_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_TRELLO_BASE_URL;
    return base.replace(/\/+$/, '');
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<TrelloApiKeyConfig>,
    path: string,
    init: TrelloFetchInit = {},
  ): Promise<TrelloResponse<T>> {
    const url = new URL(`${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`);
    // Trello authenticates by `key` + `token` query params, not headers.
    url.searchParams.set('key', connection.config.apiKey);
    url.searchParams.set('token', connection.config.token);
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (init.body !== undefined && init.body !== null && headers['Content-Type'] === undefined) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }

    const res = await fetch(url.toString(), {
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
        body = text;
      }
    }

    if (res.status >= 400) {
      // Trello frequently returns plain-text error bodies (e.g. "invalid key").
      const message = typeof body === 'string' ? body : `Trello API error (status ${res.status})`;
      throw new TrelloHttpError(res.status, body, message);
    }

    return { status: res.status, data: body as T };
  }
}
