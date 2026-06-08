import type { Job } from 'bullmq';
import type Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { SeatSyncProcessor } from './seat-sync.processor';

const ORG = 'org-1';
const job = (organizationId = ORG): Job => ({ data: { organizationId } }) as unknown as Job;

const stripeSubWithSeat = (quantity: number): Stripe.Subscription =>
  ({
    id: 'sub_1',
    items: { data: [{ id: 'si_seat', price: { id: 'price_seat_pro' }, quantity }] },
  }) as unknown as Stripe.Subscription;

describe('SeatSyncProcessor', () => {
  let prisma: {
    subscription: { findUnique: jest.Mock };
    organizationMember: { count: jest.Mock };
  };
  let stripe: { retrieveSubscription: jest.Mock; updateSeatQuantity: jest.Mock };
  let processor: SeatSyncProcessor;

  beforeEach(() => {
    prisma = {
      subscription: { findUnique: jest.fn() },
      organizationMember: { count: jest.fn() },
    };
    stripe = { retrieveSubscription: jest.fn(), updateSeatQuantity: jest.fn() };
    processor = new SeatSyncProcessor(
      prisma as unknown as PrismaService,
      stripe as unknown as StripeService,
    );
  });

  it('no-ops for a FREE / unsubscribed workspace', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: 'FREE',
      stripeSubscriptionId: null,
      seatPriceId: null,
    });

    await processor.process(job());

    expect(stripe.retrieveSubscription).not.toHaveBeenCalled();
    expect(stripe.updateSeatQuantity).not.toHaveBeenCalled();
  });

  it('updates the seat quantity to the current member count when it differs', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: 'PRO',
      stripeSubscriptionId: 'sub_1',
      seatPriceId: 'price_seat_pro',
    });
    stripe.retrieveSubscription.mockResolvedValue(stripeSubWithSeat(2));
    prisma.organizationMember.count.mockResolvedValue(4);

    await processor.process(job());

    expect(stripe.updateSeatQuantity).toHaveBeenCalledWith('sub_1', 'si_seat', 4);
  });

  it('skips the Stripe update when the seat quantity already matches', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: 'PRO',
      stripeSubscriptionId: 'sub_1',
      seatPriceId: 'price_seat_pro',
    });
    stripe.retrieveSubscription.mockResolvedValue(stripeSubWithSeat(3));
    prisma.organizationMember.count.mockResolvedValue(3);

    await processor.process(job());

    expect(stripe.updateSeatQuantity).not.toHaveBeenCalled();
  });
});
