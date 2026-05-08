import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { TwilioApiKeyConfig } from '@tietide/shared';

const DEFAULT_TWILIO_BASE_URL = 'https://api.twilio.com';

export interface TwilioFetchInit {
  method?: string;
  body?: URLSearchParams | string | null;
  headers?: Record<string, string>;
}

export interface TwilioResponse<T = unknown> {
  status: number;
  data: T | null;
}

export class TwilioHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown) {
    super(`Twilio request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class TwilioClientFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('TWILIO_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_TWILIO_BASE_URL;
    return base.replace(/\/+$/, '');
  }

  buildAuthHeader(connection: DecryptedConnection<TwilioApiKeyConfig>): {
    Authorization: string;
  } {
    const credentials = `${connection.config.accountSid}:${connection.config.authToken}`;
    const encoded = Buffer.from(credentials, 'utf8').toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<TwilioApiKeyConfig>,
    path: string,
    init: TwilioFetchInit = {},
  ): Promise<TwilioResponse<T>> {
    const url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      ...this.buildAuthHeader(connection),
      Accept: 'application/json',
      ...(init.headers ?? {}),
    };
    if (init.body !== undefined && init.body !== null) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body ?? undefined,
    });

    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (res.status >= 400) {
      throw new TwilioHttpError(res.status, data);
    }

    return { status: res.status, data: data as T };
  }
}
