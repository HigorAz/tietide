import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { TelegramBotTokenConfig } from '@tietide/shared';

const DEFAULT_TELEGRAM_BASE_URL = 'https://api.telegram.org';

export interface TelegramFetchInit {
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
}

export interface TelegramResponse<T = unknown> {
  status: number;
  data: T | null;
}

export class TelegramHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown) {
    super(`Telegram request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class TelegramClientFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('TELEGRAM_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_TELEGRAM_BASE_URL;
    return base.replace(/\/+$/, '');
  }

  // Telegram bot endpoints take the form /bot<token>/<method>. The token is the
  // entire connection credential — there's no Bearer header.
  endpoint(connection: DecryptedConnection<TelegramBotTokenConfig>, method: string): string {
    return `${this.baseUrl()}/bot${connection.config.botToken}/${method.replace(/^\/+/, '')}`;
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<TelegramBotTokenConfig>,
    method: string,
    payload?: Record<string, unknown>,
  ): Promise<TelegramResponse<T>> {
    const url = this.endpoint(connection, method);
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: BodyInit | undefined;
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(payload);
    }

    const res = await fetch(url, {
      method: payload ? 'POST' : 'GET',
      headers,
      body,
    });

    return this.finish<T>(res);
  }

  // Multipart variant for base64 uploads (sendPhoto/sendDocument). `fields` are
  // string form fields (chat_id, caption, parse_mode); `file` is the binary part.
  async callMultipart<T = Record<string, unknown>>(
    connection: DecryptedConnection<TelegramBotTokenConfig>,
    method: string,
    fields: Record<string, string>,
    file: { field: string; filename: string; content: Buffer; contentType?: string },
  ): Promise<TelegramResponse<T>> {
    const url = this.endpoint(connection, method);
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      form.append(k, v);
    }
    const blob = new Blob([new Uint8Array(file.content)], {
      type: file.contentType ?? 'application/octet-stream',
    });
    form.append(file.field, blob, file.filename);

    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: form,
    });

    return this.finish<T>(res);
  }

  private async finish<T>(res: Response): Promise<TelegramResponse<T>> {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (res.status >= 400) {
      throw new TelegramHttpError(res.status, data);
    }

    // Telegram returns 200 with { ok: false, description } on logical errors.
    const okFlag = (data as { ok?: unknown } | null)?.ok;
    if (okFlag === false) {
      // Map 401 (unauthorized) explicitly so BaseConnectorAction surfaces refresh.
      const description = (data as { description?: unknown } | null)?.description;
      const errCode = (data as { error_code?: unknown } | null)?.error_code;
      const numericCode = typeof errCode === 'number' ? errCode : 400;
      throw new TelegramHttpError(numericCode === 401 ? 401 : 400, {
        description,
        error_code: numericCode,
      });
    }

    return { status: res.status, data: data as T };
  }
}
