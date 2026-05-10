import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
} from '@tietide/sdk';

export const CALENDLY_EVENT_SCHEDULED_TYPE = 'calendly-event-scheduled';
const REPLAY_WINDOW_SECONDS = 300;

interface CalendlyApiKeyConfig {
  apiKey: string;
}

interface CalendlyNodeConfig {
  scope?: 'organization' | 'user';
  organizationUri?: string;
  userUri?: string;
  eventType?: string;
}

// Calendly signs webhooks with HMAC-SHA256.
//   header `Calendly-Webhook-Signature: t=<unix-secs>,v1=<hex>`
//   message: `${timestamp}.${rawBody}`
@Injectable()
export class CalendlyEventScheduledTrigger extends BasePushTrigger {
  readonly type = CALENDLY_EVENT_SCHEDULED_TYPE;
  readonly name = 'Calendly: Event Scheduled';
  readonly description = 'Triggers when a Calendly invitee schedules or cancels an event';

  private readonly log = new Logger(CalendlyEventScheduledTrigger.name);

  verifySignature(input: SignatureInput): boolean {
    const header = this.headerOf(input.headers, 'calendly-webhook-signature');
    if (!header) return false;

    const parsed = this.parseSignatureHeader(header);
    if (!parsed) return false;

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - parsed.timestamp) > REPLAY_WINDOW_SECONDS) return false;

    const body = Buffer.from(input.rawBody).toString('utf8');
    const expectedHex = createHmac('sha256', input.signingSecret)
      .update(`${parsed.timestamp}.${body}`)
      .digest('hex');

    let provided: Buffer;
    try {
      provided = Buffer.from(parsed.v1, 'hex');
    } catch {
      return false;
    }
    const expected = Buffer.from(expectedHex, 'hex');
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const cfg = ctx.connection.config as unknown as CalendlyApiKeyConfig;
    const node = (ctx.config ?? {}) as CalendlyNodeConfig;
    const scope = node.scope ?? 'user';
    const scopeUri = scope === 'organization' ? node.organizationUri : node.userUri;
    if (!scopeUri) {
      throw new Error(`Calendly trigger requires ${scope}Uri in node config`);
    }

    const res = await fetch('https://api.calendly.com/webhook_subscriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: ctx.callbackUrl,
        events: ['invitee.created', 'invitee.canceled'],
        organization: scope === 'organization' ? scopeUri : node.organizationUri,
        user: scope === 'user' ? scopeUri : undefined,
        scope,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Calendly webhook create failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as {
      resource?: { uri?: string; signing_key?: string };
    };
    const uri = json.resource?.uri;
    const signingKey = json.resource?.signing_key;
    if (!uri || !signingKey) {
      throw new Error('Calendly webhook response missing uri or signing_key');
    }

    return { providerSubId: uri, signingSecret: signingKey };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    const cfg = ctx.connection.config as unknown as CalendlyApiKeyConfig;
    // providerSubId is the full webhook subscription URI (Calendly returns it as such).
    const res = await fetch(ctx.providerSubId, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      this.log.warn(
        { providerSubId: ctx.providerSubId, status: res.status, body: text },
        'Calendly webhook delete failed',
      );
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

  private parseSignatureHeader(header: string): { timestamp: number; v1: string } | null {
    const parts = header.split(',').map((p) => p.trim());
    let timestamp: number | null = null;
    let v1: string | null = null;
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const key = part.slice(0, eq);
      const value = part.slice(eq + 1);
      if (key === 't') {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n)) timestamp = n;
      } else if (key === 'v1' && !v1) {
        v1 = value;
      }
    }
    if (timestamp === null || v1 === null) return null;
    return { timestamp, v1 };
  }
}
