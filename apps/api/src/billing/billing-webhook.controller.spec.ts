import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { BillingService } from './billing.service';
import { BillingWebhookController } from './billing-webhook.controller';

describe('BillingWebhookController', () => {
  let stripe: {
    constructWebhookEvent: jest.Mock;
    retrieveSubscription: jest.Mock;
    hasSecretKey: jest.Mock;
    isConfigured: jest.Mock;
  };
  let billing: { syncFromStripeSubscription: jest.Mock; markSubscriptionDeleted: jest.Mock };
  let controller: BillingWebhookController;

  const req = (rawBody = Buffer.from('{}')) => ({ rawBody }) as never;

  beforeEach(() => {
    stripe = {
      constructWebhookEvent: jest.fn(),
      retrieveSubscription: jest.fn(),
      hasSecretKey: jest.fn().mockReturnValue(true),
      isConfigured: jest.fn().mockReturnValue(true),
    };
    billing = {
      syncFromStripeSubscription: jest.fn().mockResolvedValue(undefined),
      markSubscriptionDeleted: jest.fn().mockResolvedValue(undefined),
    };
    controller = new BillingWebhookController(
      stripe as unknown as StripeService,
      billing as unknown as BillingService,
    );
  });

  it('rejects a request with no signature header', async () => {
    await expect(controller.receive(req(), undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(stripe.constructWebhookEvent).not.toHaveBeenCalled();
  });

  it('returns 503 when Stripe is partially configured (secret key set, webhook secret missing)', async () => {
    stripe.hasSecretKey.mockReturnValue(true);
    stripe.isConfigured.mockReturnValue(false);
    await expect(controller.receive(req(), 'sig')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(stripe.constructWebhookEvent).not.toHaveBeenCalled();
    expect(billing.syncFromStripeSubscription).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature with 400 and does not mutate state', async () => {
    stripe.constructWebhookEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    await expect(controller.receive(req(), 'sig')).rejects.toBeInstanceOf(BadRequestException);
    expect(billing.syncFromStripeSubscription).not.toHaveBeenCalled();
  });

  it('syncs on customer.subscription.updated', async () => {
    const sub = { id: 'sub_1' } as Stripe.Subscription;
    stripe.constructWebhookEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: { object: sub },
    });
    const result = await controller.receive(req(), 'sig');
    expect(result).toEqual({ received: true });
    expect(billing.syncFromStripeSubscription).toHaveBeenCalledWith(sub);
  });

  it('retrieves + syncs the subscription on checkout.session.completed', async () => {
    stripe.constructWebhookEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { subscription: 'sub_42' } },
    });
    stripe.retrieveSubscription.mockResolvedValue({ id: 'sub_42' });
    await controller.receive(req(), 'sig');
    expect(stripe.retrieveSubscription).toHaveBeenCalledWith('sub_42');
    expect(billing.syncFromStripeSubscription).toHaveBeenCalledWith({ id: 'sub_42' });
  });

  it('downgrades on customer.subscription.deleted', async () => {
    const sub = { id: 'sub_1' } as Stripe.Subscription;
    stripe.constructWebhookEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: sub },
    });
    await controller.receive(req(), 'sig');
    expect(billing.markSubscriptionDeleted).toHaveBeenCalledWith(sub);
  });

  it('acknowledges unhandled event types without side effects', async () => {
    stripe.constructWebhookEvent.mockReturnValue({
      type: 'customer.created',
      data: { object: {} },
    });
    const result = await controller.receive(req(), 'sig');
    expect(result).toEqual({ received: true });
    expect(billing.syncFromStripeSubscription).not.toHaveBeenCalled();
  });
});
