import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';

const DEFAULT_GRAPH_URL = 'https://graph.microsoft.com';

export interface GraphFetchInit {
  method?: string;
  body?: BodyInit | null;
  contentType?: string;
  headers?: Record<string, string>;
}

export interface GraphResponse<T = unknown> {
  status: number;
  data: T | null;
}

// Mirrors the worker's GraphHttpError so triggers can surface auth failures
// uniformly. The `response.status` field is what callers (e.g. trigger
// onActivate / onDeactivate) inspect to decide between propagating a 4xx and
// swallowing a 404 idempotency case.
export class MicrosoftGraphHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown) {
    super(`Microsoft Graph request failed with status ${status}`);
    this.name = 'MicrosoftGraphHttpError';
    this.response = { status, body };
  }
}

/**
 * API-side helper for the Microsoft 365 push-trigger lifecycle. Issues
 * authenticated requests against MS Graph using the access token stored on a
 * DecryptedConnection. Push triggers call POST /v1.0/subscriptions in
 * onActivate and DELETE /v1.0/subscriptions/{id} in onDeactivate. The worker
 * has its own MicrosoftAuthService; this is the API-side equivalent (same
 * pattern as GoogleClientFactory living in the API tree).
 */
@Injectable()
export class MicrosoftGraphFactory {
  constructor(private readonly config: ConfigService) {}

  buildAuthHeader(connection: DecryptedConnection): { Authorization: string } {
    const cfg = connection.config as unknown as MicrosoftOAuth2Config;
    return { Authorization: `Bearer ${cfg.accessToken}` };
  }

  graphBaseUrl(): string {
    const override = this.config.get<string>('MICROSOFT_GRAPH_URL');
    const base = override && override.length > 0 ? override : DEFAULT_GRAPH_URL;
    return base.replace(/\/+$/, '');
  }

  async graphFetch<T = unknown>(
    connection: DecryptedConnection,
    path: string,
    init: GraphFetchInit = {},
  ): Promise<GraphResponse<T>> {
    const url = `${this.graphBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      ...this.buildAuthHeader(connection),
      ...(init.headers ?? {}),
    };

    if (init.body !== undefined && init.body !== null) {
      headers['Content-Type'] = init.contentType ?? 'application/json';
    }

    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body ?? undefined,
    });

    if (res.status === 204 || res.status === 202) {
      return { status: res.status, data: null };
    }

    let data: unknown = null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else if (res.status >= 400) {
      try {
        data = await res.text();
      } catch {
        data = null;
      }
    }

    if (res.status >= 400) {
      throw new MicrosoftGraphHttpError(res.status, data);
    }

    return { status: res.status, data: data as T };
  }
}
