import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const STRIPE_API_VERSION = '2025-02-24.acacia';
const USAGE_RECORD_URL = (subItemId: string): string =>
  `https://api.stripe.com/v1/subscription_items/${encodeURIComponent(subItemId)}/usage_records`;

/**
 * Reports metered usage to Stripe via the REST API. The worker has no `stripe`
 * SDK dependency (its connectors call provider HTTP directly), so this uses fetch.
 * No-ops when STRIPE_SECRET_KEY is unset.
 */
@Injectable()
export class StripeUsageClient {
  private readonly secretKey: string | null;

  constructor(config: ConfigService) {
    this.secretKey = config.get<string>('STRIPE_SECRET_KEY') ?? null;
  }

  isConfigured(): boolean {
    return this.secretKey !== null && this.secretKey.length > 0;
  }

  /**
   * Report cumulative period usage for a metered subscription item. `action=set`
   * overwrites (so a retried/double-fired job can't double-count); the
   * Idempotency-Key guards an identical retry within Stripe's window.
   */
  async reportUsage(
    subscriptionItemId: string,
    quantity: number,
    timestamp: number,
    idempotencyKey: string,
  ): Promise<void> {
    if (!this.secretKey) return;
    const body = new URLSearchParams({
      quantity: String(quantity),
      timestamp: String(timestamp),
      action: 'set',
    });
    const res = await fetch(USAGE_RECORD_URL(subscriptionItemId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
        'Stripe-Version': STRIPE_API_VERSION,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Stripe usage report failed (${res.status}): ${text}`);
    }
  }
}
