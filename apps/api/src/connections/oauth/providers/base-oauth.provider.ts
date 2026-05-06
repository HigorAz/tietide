import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export abstract class BaseOAuthProvider {
  constructor(protected readonly config: ConfigService) {}

  protected env(key: string): string {
    return this.config.getOrThrow<string>(key);
  }

  protected envOptional(key: string, fallback: string): string {
    return this.config.get<string>(key) ?? fallback;
  }

  protected expiresAtFromSeconds(seconds: number | undefined | null): Date | null {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      return null;
    }
    return new Date(Date.now() + seconds * 1000);
  }

  protected async postForm(
    url: string,
    body: Record<string, string>,
    headers: Record<string, string> = {},
  ): Promise<unknown> {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      form.append(k, v);
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        ...headers,
      },
      body: form.toString(),
    });
    return this.readJson(response, url);
  }

  protected async postJson(
    url: string,
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
    return this.readJson(response, url);
  }

  private async readJson(response: Response, url: string): Promise<unknown> {
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const errorCode =
        parsed && typeof parsed === 'object' && parsed !== null && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : `HTTP ${response.status}`;
      throw new InternalServerErrorException(
        `OAuth token endpoint ${url} responded ${response.status}: ${errorCode}`,
      );
    }
    return parsed;
  }
}
