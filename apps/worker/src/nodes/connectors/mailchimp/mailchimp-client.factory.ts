import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { MailchimpApiKeyConfig } from '@tietide/shared';

export interface MailchimpFetchInit {
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
}

export interface MailchimpResponse<T = unknown> {
  status: number;
  data: T;
}

export class MailchimpHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Mailchimp request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class MailchimpClientFactory {
  constructor(private readonly config: ConfigService) {}

  // Mailchimp REST is region-pinned: https://<dc>.api.mailchimp.com/3.0/.
  baseUrl(connection: DecryptedConnection<MailchimpApiKeyConfig>): string {
    const override = this.config.get<string>('MAILCHIMP_API_URL');
    if (override && override.length > 0) return override.replace(/\/+$/, '');
    return `https://${connection.config.dataCenter}.api.mailchimp.com/3.0`;
  }

  // Mailchimp Marketing API uses HTTP Basic with username "anystring" and the
  // API key as the password. We pass "anystring=apikey" base64-encoded.
  buildAuthHeaders(connection: DecryptedConnection<MailchimpApiKeyConfig>): Record<string, string> {
    const token = Buffer.from(`anystring:${connection.config.apiKey}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<MailchimpApiKeyConfig>,
    path: string,
    init: MailchimpFetchInit = {},
  ): Promise<MailchimpResponse<T>> {
    const url = `${this.baseUrl(connection)}${path.startsWith('/') ? path : `/${path}`}`;
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
        body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string'
          ? body.detail
          : `Mailchimp API error (status ${res.status})`;
      throw new MailchimpHttpError(res.status, body, message);
    }

    return { status: res.status, data: body as T };
  }
}
