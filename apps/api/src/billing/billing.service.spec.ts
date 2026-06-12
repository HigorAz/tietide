import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { PlanTier } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { EntitlementsService } from './entitlements.service';
import { BillingService } from './billing.service';

const ORG = 'org-1';

const makeStripeSub = (overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription =>
  ({
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    metadata: { organizationId: ORG },
    cancel_at_period_end: false,
    current_period_start: 1_700_000_000,
    current_period_end: 1_702_000_000,
    items: {
      data: [
        { id: 'si_seat', price: { id: 'price_seat_pro' }, quantity: 3 },
        { id: 'si_metered', price: { id: 'price_metered_pro' } },
      ],
    },
    ...overrides,
  }) as unknown as Stripe.Subscription;

describe('BillingService', () => {
  let prisma: {
    subscription: { update: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock };
    organization: { findUnique: jest.Mock };
    organizationMember: { count: jest.Mock };
    processedStripeEvent: { create: jest.Mock };
  };
  let stripe: jest.Mocked<
    Pick<
      StripeService,
      | 'isConfigured'
      | 'planForSeatPrice'
      | 'pricesFor'
      | 'getOrCreateCustomer'
      | 'createCheckoutSession'
      | 'createBillingPortalSession'
    >
  >;
  let entitlements: { getEntitlements: jest.Mock };
  let service: BillingService;

  beforeEach(() => {
    prisma = {
      subscription: {
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ lastStripeEventAt: null }),
        findFirst: jest.fn(),
      },
      organization: { findUnique: jest.fn() },
      organizationMember: { count: jest.fn() },
      processedStripeEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    stripe = {
      isConfigured: jest.fn().mockReturnValue(true),
      planForSeatPrice: jest.fn((id: string) => (id === 'price_seat_pro' ? PlanTier.PRO : null)),
      pricesFor: jest
        .fn()
        .mockReturnValue({ seat: 'price_seat_pro', metered: 'price_metered_pro' }),
      getOrCreateCustomer: jest.fn().mockResolvedValue('cus_1'),
      createCheckoutSession: jest.fn().mockResolvedValue('https://checkout.example/s'),
      createBillingPortalSession: jest.fn().mockResolvedValue('https://portal.example/p'),
    } as never;
    entitlements = { getEntitlements: jest.fn().mockResolvedValue({ plan: 'FREE' }) };
    const config = { get: () => 'https://app.example' } as unknown as ConfigService;

    service = new BillingService(
      prisma as unknown as PrismaService,
      stripe as unknown as StripeService,
      entitlements as unknown as EntitlementsService,
      config,
    );
  });

  describe('getBilling', () => {
    it('merges the configured flag onto the entitlements snapshot', async () => {
      const result = await service.getBilling(ORG);
      expect(result).toEqual({ plan: 'FREE', configured: true });
      expect(entitlements.getEntitlements).toHaveBeenCalledWith(ORG);
    });
  });

  describe('startCheckout', () => {
    it('creates a customer, persists it, and returns the checkout URL', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: ORG,
        name: 'Acme',
        subscription: { stripeCustomerId: null },
      });
      prisma.organizationMember.count.mockResolvedValue(3);

      const result = await service.startCheckout(ORG, PlanTier.PRO);

      expect(result.url).toBe('https://checkout.example/s');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { organizationId: ORG },
        data: { stripeCustomerId: 'cus_1' },
      });
      expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cus_1', seats: 3, organizationId: ORG }),
      );
    });

    it('rejects FREE as a checkout plan', async () => {
      await expect(service.startCheckout(ORG, PlanTier.FREE)).rejects.toThrow();
    });
  });

  // A representative event timestamp (seconds since epoch → Date) for ordering.
  const T1 = new Date(1_700_000_000 * 1000);
  const T2 = new Date(1_700_009_999 * 1000); // strictly later than T1

  describe('syncFromStripeSubscription', () => {
    it('maps the Stripe subscription onto the workspace row', async () => {
      await service.syncFromStripeSubscription(makeStripeSub(), T1);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { organizationId: ORG },
        data: expect.objectContaining({
          plan: PlanTier.PRO,
          status: 'ACTIVE',
          stripeSubscriptionId: 'sub_1',
          stripeCustomerId: 'cus_1',
          seatPriceId: 'price_seat_pro',
          meteredPriceId: 'price_metered_pro',
          meteredSubItemId: 'si_metered',
          seats: 3,
          cancelAtPeriodEnd: false,
          lastStripeEventAt: T1,
        }),
      });
    });

    it('maps past_due status through', async () => {
      await service.syncFromStripeSubscription(makeStripeSub({ status: 'past_due' }), T1);
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PAST_DUE' }) }),
      );
    });

    it('falls back to the stored customer id when metadata lacks the org', async () => {
      prisma.subscription.findFirst.mockResolvedValue({ organizationId: ORG });
      await service.syncFromStripeSubscription(
        makeStripeSub({ metadata: {} as Stripe.Metadata }),
        T1,
      );
      expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_1' },
        select: { organizationId: true },
      });
      expect(prisma.subscription.update).toHaveBeenCalled();
    });

    it('applies a newer in-order event and advances lastStripeEventAt', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ lastStripeEventAt: T1 });
      await service.syncFromStripeSubscription(makeStripeSub(), T2);
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ lastStripeEventAt: T2 }) }),
      );
    });

    it('ignores a stale (older) event so a cancelled workspace is not re-elevated', async () => {
      // The workspace already processed a newer event (T2, the deletion).
      prisma.subscription.findUnique.mockResolvedValue({ lastStripeEventAt: T2 });
      // A retried/out-of-order subscription.updated arrives stamped T1 (older).
      await service.syncFromStripeSubscription(makeStripeSub(), T1);
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('markSubscriptionDeleted', () => {
    it('drops the workspace back to FREE/CANCELED and clears Stripe ids', async () => {
      await service.markSubscriptionDeleted(makeStripeSub(), T1);
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { organizationId: ORG },
        data: expect.objectContaining({
          plan: PlanTier.FREE,
          status: 'CANCELED',
          stripeSubscriptionId: null,
          meteredSubItemId: null,
          lastStripeEventAt: T1,
        }),
      });
    });

    it('ignores a stale delete event', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ lastStripeEventAt: T2 });
      await service.markSubscriptionDeleted(makeStripeSub(), T1);
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('recordStripeEvent', () => {
    it('returns true the first time an event id is seen', async () => {
      const ok = await service.recordStripeEvent('evt_1', 'customer.subscription.updated');
      expect(ok).toBe(true);
      expect(prisma.processedStripeEvent.create).toHaveBeenCalledWith({
        data: { eventId: 'evt_1', type: 'customer.subscription.updated' },
      });
    });

    it('returns false when the event id was already recorded (P2002)', async () => {
      const dup = Object.assign(new Error('unique'), { code: 'P2002' });
      prisma.processedStripeEvent.create.mockRejectedValue(dup);
      const ok = await service.recordStripeEvent('evt_1', 'customer.subscription.updated');
      expect(ok).toBe(false);
    });
  });
});
