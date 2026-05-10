import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { StripeApiKeyConfig } from '@tietide/shared';

const DEFAULT_STRIPE_BASE_URL = 'https://api.stripe.com';

export interface StripeFetchInit {
  method?: string;
  // Stripe accepts only application/x-www-form-urlencoded for POST.
  form?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface StripeResponse<T = unknown> {
  status: number;
  data: T;
}

export class StripeHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Stripe request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class StripeClientFactory {
  constructor(private readonly config: ConfigService) {}

  baseUrl(): string {
    const override = this.config.get<string>('STRIPE_API_URL');
    const base = override && override.length > 0 ? override : DEFAULT_STRIPE_BASE_URL;
    return base.replace(/\/+$/, '');
  }

  buildAuthHeaders(connection: DecryptedConnection<StripeApiKeyConfig>): Record<string, string> {
    return { Authorization: `Bearer ${connection.config.apiKey}` };
  }

  async call<T = Record<string, unknown>>(
    connection: DecryptedConnection<StripeApiKeyConfig>,
    path: string,
    init: StripeFetchInit = {},
  ): Promise<StripeResponse<T>> {
    const search = init.query ? `?${new URLSearchParams(init.query).toString()}` : '';
    const url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}${search}`;
    const headers: Record<string, string> = {
      ...this.buildAuthHeaders(connection),
      ...(init.headers ?? {}),
    };

    let body: string | undefined;
    if (init.form !== undefined) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(init.form).toString();
    }

    if (connection.config.accountId) {
      headers['Stripe-Account'] = connection.config.accountId;
    }

    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body,
    });

    let parsed: unknown = null;
    const text = await res.text();
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }

    if (res.status >= 400) {
      const errorObj =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? (parsed as { error: { message?: unknown } }).error
          : null;
      const message =
        errorObj && typeof errorObj.message === 'string'
          ? errorObj.message
          : `Stripe API error (status ${res.status})`;
      throw new StripeHttpError(res.status, parsed, message);
    }

    return { status: res.status, data: parsed as T };
  }
}

// Stripe takes nested objects via dot/bracket notation in URL-encoded forms:
// e.g. metadata[order_id]=42, expand[]=customer. This helper flattens a JSON-shaped
// payload into the encoded form Stripe expects.
export function encodeStripeForm(
  obj: Record<string, unknown>,
  prefix?: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix === undefined ? k : `${prefix}[${k}]`;
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          Object.assign(out, encodeStripeForm(item as Record<string, unknown>, `${key}[${i}]`));
        } else {
          out[`${key}[${i}]`] = String(item);
        }
      });
    } else if (typeof v === 'object') {
      Object.assign(out, encodeStripeForm(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}
