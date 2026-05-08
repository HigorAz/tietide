import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_DISCORD_API_URL = 'https://discord.com/api/v10';

export class DiscordApiError extends Error {
  readonly response: { status: number; body: unknown };
  constructor(status: number, body: unknown) {
    super(`Discord API request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class DiscordBotClientFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('DISCORD_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_DISCORD_API_URL;
    return base.replace(/\/+$/, '');
  }

  async call<T = Record<string, unknown>>(
    botToken: string,
    method: string,
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<{ status: number; data: T | null }> {
    const url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Authorization: `Bot ${botToken}`,
      Accept: 'application/json',
    };
    let body: BodyInit | undefined;
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(payload);
    }
    const res = await fetch(url, { method, headers, body });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (res.status >= 400 && res.status !== 404) {
      throw new DiscordApiError(res.status, data);
    }
    return { status: res.status, data: data as T };
  }
}
