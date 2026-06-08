import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { SEAT_SYNC_QUEUE_NAME } from './seat-sync.constants';

interface SeatSyncPayload {
  organizationId: string;
}

/**
 * Reconciles the Stripe seat (licensed) line-item quantity with the workspace's
 * current member count, with proration. No-ops for FREE / unsubscribed workspaces.
 * Runs in the API process (mirrors SubscriptionRenewerProcessor).
 */
@Processor(SEAT_SYNC_QUEUE_NAME)
export class SeatSyncProcessor extends WorkerHost {
  private readonly log = new Logger(SeatSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {
    super();
  }

  async process(job: Job<SeatSyncPayload>): Promise<void> {
    const { organizationId } = job.data;
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId },
      select: { plan: true, stripeSubscriptionId: true, seatPriceId: true },
    });
    if (!sub?.stripeSubscriptionId || sub.plan === 'FREE') {
      return;
    }

    const stripeSub = await this.stripe.retrieveSubscription(sub.stripeSubscriptionId);
    const seatItem = stripeSub.items.data.find((i) => i.price.id === sub.seatPriceId);
    if (!seatItem) {
      this.log.warn(
        { organizationId, subscriptionId: sub.stripeSubscriptionId },
        'Seat line item not found on Stripe subscription; skipping seat sync',
      );
      return;
    }

    const members = await this.prisma.organizationMember.count({ where: { organizationId } });
    const target = Math.max(members, 1);
    if ((seatItem.quantity ?? 0) === target) {
      return;
    }

    await this.stripe.updateSeatQuantity(sub.stripeSubscriptionId, seatItem.id, target);
    this.log.log({ organizationId, seats: target }, 'Synced Stripe seat quantity');
  }
}
