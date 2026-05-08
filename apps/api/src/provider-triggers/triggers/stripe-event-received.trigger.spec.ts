import { createHmac } from 'crypto';
import { StripeEventReceivedTrigger } from './stripe-event-received.trigger';

interface StripeMockHandle {
  create: jest.Mock;
  del: jest.Mock;
}

interface StripeFactoryMock {
  forApiKey: jest.Mock;
}

function makeStripeHandle(): StripeMockHandle {
  return { create: jest.fn(), del: jest.fn() };
}

function makeStripeFactory(handle: StripeMockHandle): StripeFactoryMock {
  return {
    forApiKey: jest.fn(() => ({ webhookEndpoints: handle })),
  };
}

describe('StripeEventReceivedTrigger', () => {
  let trigger: StripeEventReceivedTrigger;
  let stripe: StripeMockHandle;
  let factory: StripeFactoryMock;

  beforeEach(() => {
    stripe = makeStripeHandle();
    factory = makeStripeFactory(stripe);
    trigger = new StripeEventReceivedTrigger(factory as never);
    jest.useFakeTimers().setSystemTime(1714000000000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('verifySignature', () => {
    const signingSecret = 'whsec_test_abcdef';
    const rawBody = Buffer.from('{"id":"evt_1","type":"payment_intent.succeeded"}');

    function freshSignature(): { ts: string; v1: string } {
      const ts = Math.floor(Date.now() / 1000).toString();
      const v1 = createHmac('sha256', signingSecret)
        .update(`${ts}.${rawBody.toString('utf8')}`)
        .digest('hex');
      return { ts, v1 };
    }

    it('should accept a valid Stripe-Signature header', () => {
      const { ts, v1 } = freshSignature();
      const headers = { 'stripe-signature': `t=${ts},v1=${v1}` };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(true);
    });

    it('should reject when the body is tampered', () => {
      const { ts, v1 } = freshSignature();
      const tampered = Buffer.from('{"id":"evt_1","type":"refund.created"}');
      const headers = { 'stripe-signature': `t=${ts},v1=${v1}` };
      expect(trigger.verifySignature({ rawBody: tampered, headers, signingSecret })).toBe(false);
    });

    it('should reject when scheme is wrong (no v1)', () => {
      const { ts, v1 } = freshSignature();
      const headers = { 'stripe-signature': `t=${ts},v0=${v1}` };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(false);
    });

    it('should reject when timestamp is older than the replay window', () => {
      const oldTs = (Math.floor(Date.now() / 1000) - 600).toString();
      const oldV1 = createHmac('sha256', signingSecret)
        .update(`${oldTs}.${rawBody.toString('utf8')}`)
        .digest('hex');
      const headers = { 'stripe-signature': `t=${oldTs},v1=${oldV1}` };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(false);
    });

    it('should reject when header is missing', () => {
      expect(trigger.verifySignature({ rawBody, headers: {}, signingSecret })).toBe(false);
    });

    it('should reject when v1 hex is mismatched in length', () => {
      const { ts } = freshSignature();
      const headers = { 'stripe-signature': `t=${ts},v1=deadbeef` };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(false);
    });
  });

  describe('onActivate', () => {
    it('should call WebhookEndpoint.create with callback URL and return providerSubId + signingSecret', async () => {
      stripe.create.mockResolvedValue({ id: 'we_123', secret: 'whsec_abc123' });

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
        config: { events: ['payment_intent.succeeded'] },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      expect(factory.forApiKey).toHaveBeenCalledWith('sk_test_xxx');
      expect(stripe.create).toHaveBeenCalledWith({
        url: 'https://api.tietide.dev/v1/provider-webhooks/stripe/sub-1',
        enabled_events: ['payment_intent.succeeded'],
      });
      expect(result.providerSubId).toBe('we_123');
      expect(result.signingSecret).toBe('whsec_abc123');
    });

    it('should default to wildcard events when config does not specify them', async () => {
      stripe.create.mockResolvedValue({ id: 'we_2', secret: 'whsec_xyz' });

      await trigger.onActivate({
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
        expect.objectContaining({ enabled_events: ['*'] }),
      );
    });
  });

  describe('onDeactivate', () => {
    it('should call WebhookEndpoint.del with the stored providerSubId', async () => {
      stripe.del.mockResolvedValue({ id: 'we_123', deleted: true });

      await trigger.onDeactivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        providerSubId: 'we_123',
        connection: {
          id: 'conn-1',
          type: 'API_KEY',
          provider: 'stripe',
          config: { apiKey: 'sk_test_xxx' },
        },
        config: {},
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      expect(stripe.del).toHaveBeenCalledWith('we_123');
    });

    it('should swallow already-deleted errors so deactivation is idempotent', async () => {
      const err = new Error('No such webhook_endpoint: we_gone') as Error & { code?: string };
      err.code = 'resource_missing';
      stripe.del.mockRejectedValue(err);

      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'we_gone',
          connection: {
            id: 'conn-1',
            type: 'API_KEY',
            provider: 'stripe',
            config: { apiKey: 'sk_test_xxx' },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).resolves.not.toThrow();
    });
  });
});
