import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_TELEGRAM_BASE_URL = 'https://api.telegram.org';

export class TelegramApiError extends Error {
  readonly response: { status: number; body: unknown };
  constructor(status: number, body: unknown) {
    super(`Telegram API request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class TelegramApiFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('TELEGRAM_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_TELEGRAM_BASE_URL;
    return base.replace(/\/+$/, '');
  }

  async call<T = Record<string, unknown>>(
    botToken: string,
    method: string,
    payload?: Record<string, unknown>,
  ): Promise<{ status: number; data: T }> {
    const url = `${this.baseUrl()}/bot${botToken}/${method.replace(/^\/+/, '')}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: BodyInit | undefined;
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(payload);
    }
    const res = await fetch(url, { method: payload ? 'POST' : 'GET', headers, body });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (res.status >= 400) {
      throw new TelegramApiError(res.status, data);
    }
    return { status: res.status, data: data as T };
  }
}
