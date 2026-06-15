import { createHmac } from 'crypto';
import { WhatsappMessageReceivedTrigger } from './whatsapp-message-received.trigger';
import type { ActivationContext } from '@tietide/sdk';

describe('WhatsappMessageReceivedTrigger', () => {
  const trigger = new WhatsappMessageReceivedTrigger();
  const appSecret = 'app-secret-123';
  const verifyToken = 'verify-token-abc';

  afterEach(() => {
    delete process.env.META_APP_SECRET;
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
  });

  describe('verifySignature', () => {
    it('accepts a correct X-Hub-Signature-256 over the raw body', () => {
      const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }));
      const sig = createHmac('sha256', appSecret).update(rawBody).digest('hex');
      const ok = trigger.verifySignature({
        rawBody,
        headers: { 'x-hub-signature-256': `sha256=${sig}` },
        signingSecret: appSecret,
      });
      expect(ok).toBe(true);
    });

    it('rejects a tampered signature', () => {
      const rawBody = Buffer.from('{}');
      const ok = trigger.verifySignature({
        rawBody,
        headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
        signingSecret: appSecret,
      });
      expect(ok).toBe(false);
    });
  });

  describe('handleSubscriptionVerification', () => {
    it('echoes the challenge when the verify token matches', () => {
      process.env.META_WEBHOOK_VERIFY_TOKEN = verifyToken;
      const res = trigger.handleSubscriptionVerification!({
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': verifyToken,
          'hub.challenge': 'nonce-42',
        },
        headers: {},
        rawBody: new Uint8Array(),
      });
      expect(res).toEqual({ body: 'nonce-42', contentType: 'text/plain' });
    });

    it('returns null when the verify token does not match', () => {
      process.env.META_WEBHOOK_VERIFY_TOKEN = verifyToken;
      const res = trigger.handleSubscriptionVerification!({
        query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'x' },
        headers: {},
        rawBody: new Uint8Array(),
      });
      expect(res).toBeNull();
    });
  });

  describe('onActivate', () => {
    it('returns the app secret as the signing secret', async () => {
      process.env.META_APP_SECRET = appSecret;
      const result = await trigger.onActivate({} as ActivationContext);
      expect(result.signingSecret).toBe(appSecret);
      expect(result.providerSubId).toContain('whatsapp');
    });

    it('throws when META_APP_SECRET is not configured', async () => {
      await expect(trigger.onActivate({} as ActivationContext)).rejects.toThrow(/META_APP_SECRET/);
    });
  });
});
