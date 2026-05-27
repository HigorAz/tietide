import { createHmac } from 'crypto';
import { StripeInvoicePaidTrigger } from './stripe-invoice-paid.trigger';

interface StripeMockHandle {
  create: jest.Mock;
  del: jest.Mock;
}

function makeStripeHandle(): StripeMockHandle {
  return { create: jest.fn(), del: jest.fn() };
}

function makeStripeFactory(handle: StripeMockHandle): { forApiKey: jest.Mock } {
  return { forApiKey: jest.fn(() => ({ webhookEndpoints: handle })) };
}

describe('StripeInvoicePaidTrigger', () => {
  let trigger: StripeInvoicePaidTrigger;
  let stripe: StripeMockHandle;
  let factory: { forApiKey: jest.Mock };

  beforeEach(() => {
    stripe = makeStripeHandle();
    factory = makeStripeFactory(stripe);
    trigger = new StripeInvoicePaidTrigger(factory as never);
    jest.useFakeTimers().setSystemTime(1714000000000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('verifySignature', () => {
    const signingSecret = 'whsec_test_abcdef';
    const rawBody = Buffer.from('{"id":"evt_1","type":"invoice.paid"}');

    function freshSignature(): { ts: string; v1: string } {
      const ts = Math.floor(Date.now() / 1000).toString();
      const v1 = createHmac('sha256', signingSecret)
        .update(`${ts}.${rawBody.toString('utf8')}`)
        .digest('hex');
      return { ts, v1 };
    }

    it('accepts a valid Stripe-Signature header', () => {
      const { ts, v1 } = freshSignature();
      const headers = { 'stripe-signature': `t=${ts},v1=${v1}` };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(true);
    });

    it('rejects a tampered body', () => {
      const { ts, v1 } = freshSignature();
      const tampered = Buffer.from('{"id":"evt_1","type":"invoice.voided"}');
      const headers = { 'stripe-signature': `t=${ts},v1=${v1}` };
      expect(trigger.verifySignature({ rawBody: tampered, headers, signingSecret })).toBe(false);
    });

    it('rejects a timestamp outside the replay window', () => {
      const oldTs = (Math.floor(Date.now() / 1000) - 600).toString();
      const oldV1 = createHmac('sha256', signingSecret)
        .update(`${oldTs}.${rawBody.toString('utf8')}`)
        .digest('hex');
      const headers = { 'stripe-signature': `t=${oldTs},v1=${oldV1}` };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(false);
    });

    it('rejects a missing header', () => {
      expect(trigger.verifySignature({ rawBody, headers: {}, signingSecret })).toBe(false);
    });
  });

  describe('onActivate', () => {
    it('pins the webhook endpoint to the invoice.paid event', async () => {
      stripe.create.mockResolvedValue({ id: 'we_inv', secret: 'whsec_inv' });

      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/stripe/sub-1',
        connection: {
          id: 'conn-1',
          type: 'API_KEY',
          provider: 'stripe',
          config: { apiKey: 'sk_test_xxx' },
        },
        config: {},
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      expect(stripe.create).toHaveBeenCalledWith(
        expect.objectContaining({ enabled_events: ['invoice.paid'] }),
      );
      expect(result.providerSubId).toBe('we_inv');
      expect(result.signingSecret).toBe('whsec_inv');
    });
  });

  describe('onDeactivate', () => {
    it('deletes the webhook endpoint', async () => {
      stripe.del.mockResolvedValue({ id: 'we_inv', deleted: true });
      await trigger.onDeactivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        providerSubId: 'we_inv',
        connection: {
          id: 'conn-1',
          type: 'API_KEY',
          provider: 'stripe',
          config: { apiKey: 'sk_test_xxx' },
        },
        config: {},
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });
      expect(stripe.del).toHaveBeenCalledWith('we_inv');
    });
  });
});
