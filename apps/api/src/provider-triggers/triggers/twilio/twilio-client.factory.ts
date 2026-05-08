import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

export class TwilioApiError extends Error {
  readonly response: { status: number; body: unknown };
  constructor(status: number, body: unknown) {
    super(`Twilio API request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class TwilioApiFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('TWILIO_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_TWILIO_BASE_URL;
    return base.replace(/\/+$/, '');
  }

  async call<T = Record<string, unknown>>(
    accountSid: string,
    authToken: string,
    path: string,
    init: TwilioFetchInit = {},
  ): Promise<TwilioResponse<T>> {
    const url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    const credentials = Buffer.from(`${accountSid}:${authToken}`, 'utf8').toString('base64');
    const headers: Record<string, string> = {
      Authorization: `Basic ${credentials}`,
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
      throw new TwilioApiError(res.status, data);
    }
    return { status: res.status, data: data as T };
  }
}
