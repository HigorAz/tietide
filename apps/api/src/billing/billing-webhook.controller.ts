import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { BillingService } from './billing.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Public Stripe webhook receiver. Verifies the `stripe-signature` against the raw
 * body (rawBody is enabled globally in main.ts), then idempotently reconciles the
 * workspace's subscription. All handlers are pure upserts, so replays are safe.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('billing/webhook')
export class BillingWebhookController {
  private readonly log = new Logger(BillingWebhookController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly billing: BillingService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: RawBodyRequest,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    // Surface a partial misconfiguration (secret key set, but webhook signing
    // secret blank) as 503 — distinct from attacker noise (400). Without the
    // signing secret we can never verify the payload, so reject loudly rather
    // than letting subscription sync silently break (W5.26).
    if (this.stripe.hasSecretKey() && !this.stripe.isConfigured()) {
      this.log.error(
        'Stripe webhook received but STRIPE_WEBHOOK_SECRET is not configured — cannot verify signature',
      );
      throw new ServiceUnavailableException('Billing webhook is not fully configured');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    const rawBody = req.rawBody ?? Buffer.alloc(0);

    let event: Stripe.Event;
    try {
      event = this.stripe.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      this.log.warn({ err }, 'Rejected Stripe webhook with invalid signature');
      throw new BadRequestException('Invalid Stripe signature');
    }

    await this.dispatch(event);
    return { received: true };
  }

  private async dispatch(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (typeof session.subscription === 'string') {
          const sub = await this.stripe.retrieveSubscription(session.subscription);
          await this.billing.syncFromStripeSubscription(sub);
        }
        return;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await this.billing.syncFromStripeSubscription(event.data.object as Stripe.Subscription);
        return;
      }
      case 'customer.subscription.deleted': {
        await this.billing.markSubscriptionDeleted(event.data.object as Stripe.Subscription);
        return;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
        if (typeof invoice.subscription === 'string') {
          const sub = await this.stripe.retrieveSubscription(invoice.subscription);
          await this.billing.syncFromStripeSubscription(sub);
        }
        return;
      }
      default:
        // Unhandled event types are acknowledged (200) so Stripe stops retrying.
        return;
    }
  }
}
