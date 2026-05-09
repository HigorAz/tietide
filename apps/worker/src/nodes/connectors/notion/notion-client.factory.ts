import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { NotionOAuth2Config } from '@tietide/shared';

const DEFAULT_NOTION_BASE_URL = 'https://api.notion.com';
const DEFAULT_NOTION_VERSION = '2022-06-28';

export interface NotionFetchInit {
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
}

export interface NotionResponse<T = unknown> {
  status: number;
  data: T;
}

// Notion returns standard HTTP 4xx codes (401 for invalid_token / unauthorized,
// 403 for restricted_resource) — no in-body `ok:false` flag like Slack — so a
// pass-through factory is enough to drive BaseConnectorAction's refresh path.
export class NotionHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Notion request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class NotionClientFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('NOTION_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_NOTION_BASE_URL;
    return base.replace(/\/+$/, '');
  }

  notionVersion(): string {
    const override = this.config.get<string>('NOTION_VERSION');
    return override && override.length > 0 ? override : DEFAULT_NOTION_VERSION;
  }

  buildAuthHeaders(connection: DecryptedConnection<NotionOAuth2Config>): Record<string, string> {
    return {
      Authorization: `Bearer ${connection.config.accessToken}`,
      'Notion-Version': this.notionVersion(),
    };
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<NotionOAuth2Config>,
    path: string,
    init: NotionFetchInit = {},
  ): Promise<NotionResponse<T>> {
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
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (res.status >= 400) {
      const message =
        (body as { message?: unknown } | null)?.message &&
        typeof (body as { message?: unknown }).message === 'string'
          ? (body as { message: string }).message
          : `Notion API error (status ${res.status})`;
      throw new NotionHttpError(res.status, body, message);
    }

    return { status: res.status, data: body as T };
  }
}
