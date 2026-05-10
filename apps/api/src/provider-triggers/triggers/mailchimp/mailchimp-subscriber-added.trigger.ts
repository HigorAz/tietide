import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
  type ValidationInput,
  type ValidationResponse,
} from '@tietide/sdk';

export const MAILCHIMP_SUBSCRIBER_ADDED_TYPE = 'mailchimp-subscriber-added';

interface MailchimpApiKeyConfig {
  apiKey: string;
  dataCenter: string;
}

interface MailchimpNodeConfig {
  listId?: string;
  eventType?: string;
}

// Mailchimp doesn't sign webhooks. Instead it gives you whatever URL you registered
// and POSTs to it; you protect the endpoint by including a hard-to-guess token in
// the URL itself. We generate a 32-byte random token and append it as a query
// param `?secret=<token>` to the callback URL. verifySignature reads that param
// from the request headers' x-secret-shadow (the controller injects it from the
// query string before delivery — see provider-webhooks logic) and compares it
// constant-time. If we cannot detect the secret in headers, we re-extract it
// from the original request URL via the `x-original-url` header that the
// controller forwards.
@Injectable()
export class MailchimpSubscriberAddedTrigger extends BasePushTrigger {
  readonly type = MAILCHIMP_SUBSCRIBER_ADDED_TYPE;
  readonly name = 'Mailchimp: Subscriber Added';
  readonly description = 'Triggers on Mailchimp audience webhook events';

  private readonly log = new Logger(MailchimpSubscriberAddedTrigger.name);

  // Mailchimp pings the webhook URL with a HEAD/GET on creation to verify it
  // resolves. Respond 200 to anything that isn't a POST so the create call
  // succeeds. We surface this via handleValidation: the controller invokes it
  // before signature verification.
  handleValidation(input: ValidationInput): ValidationResponse | null {
    // The controller hands over only POST bodies — for HEAD/GET it never
    // reaches us. But Mailchimp sometimes pings with `?ping=1` even on POSTs;
    // detect and short-circuit those.
    const ping = this.firstQuery(input.query, 'ping');
    if (ping === '1' || ping === 'pong') {
      return { body: '', contentType: 'text/plain' };
    }
    return null;
  }

  verifySignature(input: SignatureInput): boolean {
    const provided = this.extractSecret(input);
    if (!provided) return false;

    const expected = input.signingSecret;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const cfg = ctx.connection.config as unknown as MailchimpApiKeyConfig;
    const node = (ctx.config ?? {}) as MailchimpNodeConfig;
    if (!node.listId) throw new Error('Mailchimp trigger requires listId in node config');

    const secret = randomBytes(32).toString('base64url');
    const callbackWithSecret = appendQueryParam(ctx.callbackUrl, 'secret', secret);

    const url = `https://${cfg.dataCenter}.api.mailchimp.com/3.0/lists/${node.listId}/webhooks`;
    const body = {
      url: callbackWithSecret,
      events: {
        subscribe: true,
        unsubscribe: true,
        profile: true,
        cleaned: true,
        upemail: true,
        campaign: false,
      },
      sources: { user: true, admin: true, api: true },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`anystring:${cfg.apiKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mailchimp webhook create failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as { id?: string };
    if (!json.id) throw new Error('Mailchimp webhook create did not return an id');

    return { providerSubId: json.id, signingSecret: secret };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    const cfg = ctx.connection.config as unknown as MailchimpApiKeyConfig;
    const node = (ctx.config ?? {}) as MailchimpNodeConfig;
    if (!node.listId) return;

    const url = `https://${cfg.dataCenter}.api.mailchimp.com/3.0/lists/${node.listId}/webhooks/${ctx.providerSubId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`anystring:${cfg.apiKey}`).toString('base64')}`,
      },
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      this.log.warn(
        { providerSubId: ctx.providerSubId, status: res.status, body: text },
        'Mailchimp webhook delete failed',
      );
    }
  }

  private extractSecret(input: SignatureInput): string | null {
    // The provider-webhooks controller forwards the inbound URL's query
    // through a synthetic header `x-tietide-callback-secret` so triggers can
    // extract it without needing the URL builder. If absent, peek at
    // `x-original-url` as a fallback.
    const direct = this.headerOf(input.headers, 'x-tietide-callback-secret');
    if (direct) return direct;
    const original = this.headerOf(input.headers, 'x-original-url');
    if (!original) return null;
    try {
      const u = new URL(original);
      return u.searchParams.get('secret');
    } catch {
      return null;
    }
  }

  private headerOf(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | null {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== lower) continue;
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
    }
    return null;
  }

  private firstQuery(
    query: Record<string, string | string[] | undefined>,
    name: string,
  ): string | null {
    const v = query[name];
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && v.length > 0) return v[0];
    return null;
  }
}

function appendQueryParam(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}
