import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import type { SubscriptionStatus } from '@prisma/client';
import { PlanTier, type PlanTier as PlanTierType } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { EntitlementsService } from './entitlements.service';
import type { EntitlementsDto } from './dto/entitlements.dto';

export interface BillingOverviewDto extends EntitlementsDto {
  /** False when Stripe keys are absent — the SPA hides upgrade/manage actions. */
  configured: boolean;
}

/** Map Stripe's subscription status string onto our enum (unknown → PAST_DUE, safest). */
function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    case 'incomplete':
      return 'INCOMPLETE';
    case 'incomplete_expired':
      return 'INCOMPLETE_EXPIRED';
    case 'unpaid':
      return 'UNPAID';
    default:
      return 'PAST_DUE';
  }
}

@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly entitlements: EntitlementsService,
    private readonly config: ConfigService,
  ) {}

  private spaBase(): string {
    return this.config.get<string>('SPA_BASE_URL') ?? 'http://localhost:5173';
  }

  async getBilling(orgId: string): Promise<BillingOverviewDto> {
    const entitlements = await this.entitlements.getEntitlements(orgId);
    return { ...entitlements, configured: this.stripe.isConfigured() };
  }

  /** Start a Checkout session to subscribe the workspace to a paid plan. */
  async startCheckout(orgId: string, plan: PlanTierType): Promise<{ url: string }> {
    if (plan === PlanTier.FREE) {
      throw new BadRequestException('FREE is not a checkout plan');
    }
    const prices = this.stripe.pricesFor(plan);
    if (!prices) {
      throw new BadRequestException(`No Stripe prices configured for ${plan}`);
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, subscription: { select: { stripeCustomerId: true } } },
    });
    if (!org) throw new BadRequestException('Workspace not found');

    const customerId = await this.stripe.getOrCreateCustomer({
      organizationId: orgId,
      name: org.name,
      existingCustomerId: org.subscription?.stripeCustomerId ?? null,
    });
    // Persist the customer id immediately so a later webhook can resolve the org
    // even if the user abandons checkout.
    await this.prisma.subscription.update({
      where: { organizationId: orgId },
      data: { stripeCustomerId: customerId },
    });

    const seats = await this.prisma.organizationMember.count({ where: { organizationId: orgId } });
    const base = this.spaBase();
    const url = await this.stripe.createCheckoutSession({
      customerId,
      organizationId: orgId,
      seatPriceId: prices.seat,
      meteredPriceId: prices.metered,
      seats: Math.max(seats, 1),
      successUrl: `${base}/settings?billing=success`,
      cancelUrl: `${base}/settings?billing=cancelled`,
    });
    return { url };
  }

  /** Open the Stripe billing portal for the workspace's customer. */
  async openPortal(orgId: string): Promise<{ url: string }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId: orgId },
      select: { stripeCustomerId: true },
    });
    if (!sub?.stripeCustomerId) {
      throw new BadRequestException('This workspace has no billing account yet');
    }
    const url = await this.stripe.createBillingPortalSession(
      sub.stripeCustomerId,
      `${this.spaBase()}/settings`,
    );
    return { url };
  }

  /**
   * Idempotently reconcile a workspace's subscription row from a Stripe
   * Subscription object (webhook-driven). Keyed by metadata.organizationId, with a
   * fallback to the stored stripeCustomerId.
   */
  async syncFromStripeSubscription(sub: Stripe.Subscription): Promise<void> {
    const orgId = await this.resolveOrgId(sub);
    if (!orgId) {
      this.log.warn({ subscriptionId: sub.id }, 'Stripe subscription has no resolvable workspace');
      return;
    }

    const seatItem = sub.items.data.find((i) => this.stripe.planForSeatPrice(i.price.id) !== null);
    const plan = this.stripe.planForSeatPrice(seatItem?.price.id) ?? PlanTier.FREE;
    const meteredItem = sub.items.data.find((i) => i.id !== seatItem?.id);

    const period = sub as unknown as {
      current_period_start?: number;
      current_period_end?: number;
    };

    await this.prisma.subscription.update({
      where: { organizationId: orgId },
      data: {
        plan,
        status: mapStatus(sub.status),
        stripeSubscriptionId: sub.id,
        stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
        seatPriceId: seatItem?.price.id ?? null,
        meteredPriceId: meteredItem?.price.id ?? null,
        meteredSubItemId: meteredItem?.id ?? null,
        seats: seatItem?.quantity ?? 1,
        currentPeriodStart: period.current_period_start
          ? new Date(period.current_period_start * 1000)
          : null,
        currentPeriodEnd: period.current_period_end
          ? new Date(period.current_period_end * 1000)
          : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      },
    });
  }

  /** A subscription was deleted/ended at Stripe — drop the workspace back to FREE. */
  async markSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
    const orgId = await this.resolveOrgId(sub);
    if (!orgId) return;
    await this.prisma.subscription.update({
      where: { organizationId: orgId },
      data: {
        plan: PlanTier.FREE,
        status: 'CANCELED',
        stripeSubscriptionId: null,
        seatPriceId: null,
        meteredPriceId: null,
        meteredSubItemId: null,
        cancelAtPeriodEnd: false,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      },
    });
  }

  private async resolveOrgId(sub: Stripe.Subscription): Promise<string | null> {
    const fromMetadata = sub.metadata?.organizationId;
    if (fromMetadata) return fromMetadata;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const row = await this.prisma.subscription.findFirst({
      where: { stripeCustomerId: customerId },
      select: { organizationId: true },
    });
    return row?.organizationId ?? null;
  }
}
