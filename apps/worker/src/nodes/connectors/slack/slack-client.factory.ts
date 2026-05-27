import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { SlackOAuth2Config } from '@tietide/shared';

const DEFAULT_SLACK_BASE_URL = 'https://slack.com/api';

export interface SlackFetchInit {
  method?: string;
  body?: BodyInit | null;
  contentType?: string;
  headers?: Record<string, string>;
  // Some Slack methods (search.messages) require a user token (xoxp) rather than
  // the bot token. When set and the connection carries a userAccessToken, the
  // Authorization header is overridden with the user token.
  useUserToken?: boolean;
}

export interface SlackResponse<T = unknown> {
  status: number;
  data: T;
}

// Slack returns HTTP 200 even on logical errors; the body's `ok: false` carries the
// real status. We surface auth errors (`invalid_auth`, `not_authed`,
// `token_revoked`, `account_inactive`) as `.response.status = 401` so
// BaseConnectorAction triggers the standard refresh path.
const AUTH_ERRORS = new Set(['invalid_auth', 'not_authed', 'token_revoked', 'account_inactive']);

export class SlackHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Slack request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class SlackClientFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('SLACK_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_SLACK_BASE_URL;
    return base.replace(/\/+$/, '');
  }

  buildAuthHeader(connection: DecryptedConnection<SlackOAuth2Config>): { Authorization: string } {
    return { Authorization: `Bearer ${connection.config.accessToken}` };
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<SlackOAuth2Config>,
    path: string,
    init: SlackFetchInit = {},
  ): Promise<SlackResponse<T>> {
    const url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      ...this.buildAuthHeader(connection),
      ...(init.headers ?? {}),
    };
    if (init.useUserToken && connection.config.userAccessToken) {
      headers.Authorization = `Bearer ${connection.config.userAccessToken}`;
    }
    if (init.body !== undefined && init.body !== null) {
      // Empty string ⇒ caller is sending FormData and wants fetch to set the
      // multipart boundary header itself.
      if (init.contentType === undefined) {
        headers['Content-Type'] = 'application/json; charset=utf-8';
      } else if (init.contentType !== '') {
        headers['Content-Type'] = init.contentType;
      }
    }

    const res = await fetch(url, {
      method: init.method ?? 'POST',
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
      throw new SlackHttpError(res.status, body);
    }

    const okFlag = (body as { ok?: unknown } | null)?.ok;
    if (okFlag === false) {
      const err = (body as { error?: unknown } | null)?.error;
      const errorCode = typeof err === 'string' ? err : 'slack_error';
      const status = AUTH_ERRORS.has(errorCode) ? 401 : 400;
      throw new SlackHttpError(status, body, `Slack API error: ${errorCode}`);
    }

    return { status: res.status, data: body as T };
  }
}
