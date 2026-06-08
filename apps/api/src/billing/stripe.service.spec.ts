import { ConfigService } from '@nestjs/config';
import { PlanTier } from '@tietide/shared';
import { StripeService } from './stripe.service';

const makeConfig = (values: Record<string, string | undefined>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('StripeService', () => {
  describe('isConfigured', () => {
    it('is true only when both the secret key and webhook secret are set', () => {
      expect(
        new StripeService(
          makeConfig({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }),
        ).isConfigured(),
      ).toBe(true);
    });

    it('is false when the secret key is missing', () => {
      expect(
        new StripeService(makeConfig({ STRIPE_WEBHOOK_SECRET: 'whsec_x' })).isConfigured(),
      ).toBe(false);
    });

    it('is false when the webhook secret is missing', () => {
      expect(new StripeService(makeConfig({ STRIPE_SECRET_KEY: 'sk_test_x' })).isConfigured()).toBe(
        false,
      );
    });
  });

  describe('pricesFor / planForSeatPrice', () => {
    const svc = new StripeService(
      makeConfig({
        STRIPE_SECRET_KEY: 'sk_test_x',
        STRIPE_WEBHOOK_SECRET: 'whsec_x',
        STRIPE_PRICE_SEAT_PRO: 'price_seat_pro',
        STRIPE_PRICE_METERED_PRO: 'price_metered_pro',
        STRIPE_PRICE_SEAT_BUSINESS: 'price_seat_biz',
        STRIPE_PRICE_METERED_BUSINESS: 'price_metered_biz',
      }),
    );

    it('returns the seat + metered price pair for a paid plan', () => {
      expect(svc.pricesFor(PlanTier.PRO)).toEqual({
        seat: 'price_seat_pro',
        metered: 'price_metered_pro',
      });
    });

    it('returns null for FREE', () => {
      expect(svc.pricesFor(PlanTier.FREE)).toBeNull();
    });

    it('reverse-maps a seat price id to its plan', () => {
      expect(svc.planForSeatPrice('price_seat_pro')).toBe(PlanTier.PRO);
      expect(svc.planForSeatPrice('price_seat_biz')).toBe(PlanTier.BUSINESS);
      expect(svc.planForSeatPrice('price_unknown')).toBeNull();
      expect(svc.planForSeatPrice(undefined)).toBeNull();
    });

    it('returns null prices when env ids are absent', () => {
      const bare = new StripeService(
        makeConfig({ STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh' }),
      );
      expect(bare.pricesFor(PlanTier.PRO)).toBeNull();
    });
  });
});
