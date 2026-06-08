import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PlanTier } from '@tietide/shared';

// Pin to the same API version as the workflow-node Stripe client factory.
const STRIPE_API_VERSION = '2025-02-24.acacia';

export interface PlanPrices {
  seat: string;
  metered: string;
}

export interface CheckoutParams {
  customerId: string;
  organizationId: string;
  seatPriceId: string;
  meteredPriceId: string;
  seats: number;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Thin wrapper over the Stripe SDK using the PLATFORM secret key (not the
 * user-facing Stripe workflow nodes). Degrades gracefully when unconfigured:
 * `isConfigured()` is false and mutating calls throw 503 so the SPA can hide the
 * upgrade UI in dev/test environments without Stripe keys.
 */
@Injectable()
export class StripeService {
  private readonly log = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = key ? new Stripe(key, { apiVersion: STRIPE_API_VERSION }) : null;
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
    if (!this.stripe) {
      this.log.warn('STRIPE_SECRET_KEY not set — billing endpoints will report unconfigured');
    }
  }

  isConfigured(): boolean {
    return this.stripe !== null && this.webhookSecret.length > 0;
  }

  private client(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Billing is not configured');
    }
    return this.stripe;
  }

  /** Stripe seat + metered price ids for a paid plan, from env. Null for FREE/unconfigured. */
  pricesFor(plan: PlanTier): PlanPrices | null {
    if (plan === PlanTier.PRO) {
      return this.pricePair('STRIPE_PRICE_SEAT_PRO', 'STRIPE_PRICE_METERED_PRO');
    }
    if (plan === PlanTier.BUSINESS) {
      return this.pricePair('STRIPE_PRICE_SEAT_BUSINESS', 'STRIPE_PRICE_METERED_BUSINESS');
    }
    return null;
  }

  /** Reverse lookup: which plan a given SEAT price id belongs to. */
  planForSeatPrice(priceId: string | null | undefined): PlanTier | null {
    if (!priceId) return null;
    if (priceId === this.config.get<string>('STRIPE_PRICE_SEAT_PRO')) return PlanTier.PRO;
    if (priceId === this.config.get<string>('STRIPE_PRICE_SEAT_BUSINESS')) return PlanTier.BUSINESS;
    return null;
  }

  private pricePair(seatKey: string, meteredKey: string): PlanPrices | null {
    const seat = this.config.get<string>(seatKey);
    const metered = this.config.get<string>(meteredKey);
    return seat && metered ? { seat, metered } : null;
  }

  async getOrCreateCustomer(params: {
    organizationId: string;
    name: string;
    email?: string;
    existingCustomerId: string | null;
  }): Promise<string> {
    if (params.existingCustomerId) return params.existingCustomerId;
    const customer = await this.client().customers.create({
      name: params.name,
      email: params.email,
      metadata: { organizationId: params.organizationId },
    });
    return customer.id;
  }

  async createCheckoutSession(params: CheckoutParams): Promise<string> {
    const session = await this.client().checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      line_items: [
        { price: params.seatPriceId, quantity: params.seats },
        { price: params.meteredPriceId },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.organizationId,
      metadata: { organizationId: params.organizationId },
      subscription_data: { metadata: { organizationId: params.organizationId } },
    });
    if (!session.url) {
      throw new ServiceUnavailableException('Stripe did not return a checkout URL');
    }
    return session.url;
  }

  async createBillingPortalSession(customerId: string, returnUrl: string): Promise<string> {
    const session = await this.client().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  /** Verify + parse a webhook payload. Throws if the signature is invalid. */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.client().webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }

  retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.client().subscriptions.retrieve(subscriptionId);
  }

  /** Set the seat line item's quantity with proration (used by the seat-sync queue). */
  async updateSeatQuantity(
    subscriptionId: string,
    seatItemId: string,
    quantity: number,
  ): Promise<void> {
    await this.client().subscriptions.update(subscriptionId, {
      items: [{ id: seatItemId, quantity }],
      proration_behavior: 'create_prorations',
    });
  }

  /** Report cumulative period usage to a metered subscription item (idempotent via set). */
  async reportUsage(
    subscriptionItemId: string,
    quantity: number,
    timestamp: number,
  ): Promise<void> {
    await this.client().subscriptionItems.createUsageRecord(subscriptionItemId, {
      quantity,
      timestamp,
      action: 'set',
    });
  }
}
