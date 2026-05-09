import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { LinearApiKeyConfig } from '@tietide/shared';

const DEFAULT_LINEAR_API_URL = 'https://api.linear.app/graphql';

export interface LinearGraphQLResponse<T = unknown> {
  status: number;
  data: T | null;
  errors: ReadonlyArray<{ message: string; extensions?: Record<string, unknown> }> | null;
}

export class LinearHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Linear request failed with status ${status}`);
    this.response = { status, body };
  }
}

// Linear-specific authentication errors arrive as HTTP 200 with an `errors[]`
// array containing `extensions.code === 'AUTHENTICATION_ERROR'`. We surface
// those as a 401 so BaseConnectorAction's auth path triggers if the connection
// ever gains a refresh token (today PATs do not refresh).
const LINEAR_AUTH_CODES = new Set(['AUTHENTICATION_ERROR', 'AUTHORIZATION_ERROR', 'INVALID_INPUT']);

@Injectable()
export class LinearClientFactory {
  constructor(private readonly config: ConfigService) {}

  endpointUrl(): string {
    const override = this.config.get<string>('LINEAR_API_URL');
    return override && override.length > 0 ? override : DEFAULT_LINEAR_API_URL;
  }

  buildAuthHeader(connection: DecryptedConnection<LinearApiKeyConfig>): { Authorization: string } {
    // Linear accepts the API key directly in the Authorization header, no Bearer prefix.
    return { Authorization: connection.config.apiKey };
  }

  async query<T = Record<string, unknown>>(
    connection: DecryptedConnection<LinearApiKeyConfig>,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<LinearGraphQLResponse<T>> {
    const headers: Record<string, string> = {
      ...this.buildAuthHeader(connection),
      'Content-Type': 'application/json; charset=utf-8',
    };

    const res = await fetch(this.endpointUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables: variables ?? {} }),
    });

    type LinearBody = {
      data?: T;
      errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
    };
    let body: LinearBody | null = null;
    try {
      body = (await res.json()) as LinearBody;
    } catch {
      body = null;
    }

    if (res.status >= 400) {
      throw new LinearHttpError(res.status, body, `Linear HTTP ${res.status}`);
    }

    const errors = body?.errors ?? null;
    if (errors && errors.length > 0) {
      const codes = errors
        .map((e) => (e.extensions?.code ? String(e.extensions.code) : ''))
        .filter(Boolean);
      const isAuth = codes.some((c) => LINEAR_AUTH_CODES.has(c));
      const status = isAuth ? 401 : 400;
      throw new LinearHttpError(
        status,
        body,
        `Linear GraphQL error: ${errors.map((e) => e.message).join('; ')}`,
      );
    }

    return { status: res.status, data: body?.data ?? null, errors: null };
  }
}
