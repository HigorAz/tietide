import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type Stripe from 'stripe';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
} from '@tietide/sdk';
import { StripeClientFactory } from './stripe-client.factory';

export const STRIPE_INVOICE_PAID_TYPE = 'stripe-invoice-paid';
const STRIPE_REPLAY_WINDOW_SECONDS = 300;

// Filtered convenience over stripe-event-received: the Stripe webhook endpoint is
// pinned to the single `invoice.paid` event. Signature verification is identical
// to the generic Stripe trigger (HMAC-SHA256 over `timestamp.body`).
const INVOICE_PAID_EVENT = 'invoice.paid';

interface StripeApiKeyConfig {
  apiKey: string;
}

@Injectable()
export class StripeInvoicePaidTrigger extends BasePushTrigger {
  readonly type = STRIPE_INVOICE_PAID_TYPE;
  readonly name = 'Stripe: Invoice Paid';
  readonly description = 'Triggers when a Stripe invoice is paid';

  private readonly log = new Logger(StripeInvoicePaidTrigger.name);

  constructor(private readonly stripeClient: StripeClientFactory) {
    super();
  }

  verifySignature(input: SignatureInput): boolean {
    const header = this.extractHeader(input.headers, 'stripe-signature');
    if (!header) return false;

    const parsed = this.parseStripeSignature(header);
    if (!parsed) return false;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - parsed.timestamp) > STRIPE_REPLAY_WINDOW_SECONDS) {
      return false;
    }

    const bodyBuf = Buffer.from(input.rawBody);
    const expectedHex = createHmac('sha256', input.signingSecret)
      .update(`${parsed.timestamp}.${bodyBuf.toString('utf8')}`)
      .digest('hex');

    const expected = Buffer.from(expectedHex, 'hex');
    let provided: Buffer;
    try {
      provided = Buffer.from(parsed.v1, 'hex');
    } catch {
      return false;
    }
    if (provided.length !== expected.length) return false;

    return timingSafeEqual(provided, expected);
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const cfg = ctx.connection.config as unknown as StripeApiKeyConfig;
    const stripe = this.stripeClient.forApiKey(cfg.apiKey);
    const endpoint = await stripe.webhookEndpoints.create({
      url: ctx.callbackUrl,
      enabled_events: [
        INVOICE_PAID_EVENT,
      ] as unknown as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
    });

    if (!endpoint.secret) {
      throw new Error('Stripe did not return a signing secret on webhook creation');
    }

    return {
      providerSubId: endpoint.id,
      signingSecret: endpoint.secret,
    };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    const cfg = ctx.connection.config as unknown as StripeApiKeyConfig;
    const stripe = this.stripeClient.forApiKey(cfg.apiKey);

    try {
      await stripe.webhookEndpoints.del(ctx.providerSubId);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'resource_missing') {
        this.log.warn(
          { providerSubId: ctx.providerSubId, workflowId: ctx.workflowId },
          'Stripe webhook already deleted, skipping',
        );
        return;
      }
      throw err;
    }
  }

  private extractHeader(
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

  private parseStripeSignature(header: string): { timestamp: number; v1: string } | null {
    const parts = header.split(',').map((p) => p.trim());
    let timestamp: number | null = null;
    let v1: string | null = null;
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const key = part.slice(0, eq);
      const value = part.slice(eq + 1);
      if (key === 't') {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) timestamp = parsed;
      } else if (key === 'v1' && !v1) {
        v1 = value;
      }
    }
    if (timestamp === null || v1 === null) return null;
    return { timestamp, v1 };
  }
}
