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

// Shape thrown when Graph returns a non-2xx response. The `response.status`
// field matches what BaseConnectorAction.isAuthError() expects so 401/403
// trigger the connection-refresh flow without per-node plumbing.
export class GraphHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown) {
    super(`Microsoft Graph request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class MicrosoftAuthService {
  constructor(private readonly config: ConfigService) {}

  buildAuthHeader(connection: DecryptedConnection<MicrosoftOAuth2Config>): {
    Authorization: string;
  } {
    return { Authorization: `Bearer ${connection.config.accessToken}` };
  }

  graphBaseUrl(): string {
    const override = this.config.get<string>('MICROSOFT_GRAPH_URL');
    const base = override && override.length > 0 ? override : DEFAULT_GRAPH_URL;
    return base.replace(/\/+$/, '');
  }

  async graphFetch<T = unknown>(
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
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
      // Capture text body for diagnostics on non-JSON error responses.
      try {
        data = await res.text();
      } catch {
        data = null;
      }
    }

    if (res.status >= 400) {
      throw new GraphHttpError(res.status, data);
    }

    return { status: res.status, data: data as T };
  }
}
