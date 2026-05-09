import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { GitHubApiKeyConfig } from '@tietide/shared';

const DEFAULT_GITHUB_API_URL = 'https://api.github.com';

export interface GitHubFetchInit {
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
}

export interface GitHubResponse<T = unknown> {
  status: number;
  data: T;
}

export class GitHubHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `GitHub request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class GitHubClientFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('GITHUB_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_GITHUB_API_URL;
    return base.replace(/\/+$/, '');
  }

  buildAuthHeaders(connection: DecryptedConnection<GitHubApiKeyConfig>): Record<string, string> {
    return {
      Authorization: `Bearer ${connection.config.apiKey}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<GitHubApiKeyConfig>,
    path: string,
    init: GitHubFetchInit = {},
  ): Promise<GitHubResponse<T>> {
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
          : `GitHub API error (status ${res.status})`;
      throw new GitHubHttpError(res.status, body, message);
    }

    return { status: res.status, data: body as T };
  }
}
