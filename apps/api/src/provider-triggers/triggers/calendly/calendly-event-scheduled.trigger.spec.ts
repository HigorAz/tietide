import { createHmac } from 'crypto';
import { CalendlyEventScheduledTrigger } from './calendly-event-scheduled.trigger';
import type { SignatureInput } from '@tietide/sdk';

const SECRET = 'sig-key-abc';

function freshSig(body: string, ts: number = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
  return `t=${ts},v1=${v1}`;
}

function input(overrides: Partial<SignatureInput> = {}): SignatureInput {
  return {
    rawBody: new TextEncoder().encode('{}'),
    headers: {},
    signingSecret: SECRET,
    ...overrides,
  };
}

describe('CalendlyEventScheduledTrigger', () => {
  let trigger: CalendlyEventScheduledTrigger;

  beforeEach(() => {
    trigger = new CalendlyEventScheduledTrigger();
  });

  describe('verifySignature', () => {
    it('accepts a fresh signature', () => {
      const body = '{"event":"invitee.created"}';
      const sig = freshSig(body);
      expect(
        trigger.verifySignature(
          input({
            rawBody: new TextEncoder().encode(body),
            headers: { 'calendly-webhook-signature': sig },
          }),
        ),
      ).toBe(true);
    });

    it('rejects tampered body', () => {
      const sig = freshSig('{"event":"a"}');
      expect(
        trigger.verifySignature(
          input({
            rawBody: new TextEncoder().encode('{"event":"b"}'),
            headers: { 'calendly-webhook-signature': sig },
          }),
        ),
      ).toBe(false);
    });

    it('rejects timestamps outside replay window', () => {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const sig = freshSig('{}', old);
      expect(
        trigger.verifySignature(input({ headers: { 'calendly-webhook-signature': sig } })),
      ).toBe(false);
    });

    it('rejects when signature header is missing', () => {
      expect(trigger.verifySignature(input({ headers: {} }))).toBe(false);
    });

    it('rejects when v1 is malformed hex', () => {
      const ts = Math.floor(Date.now() / 1000);
      expect(
        trigger.verifySignature(
          input({ headers: { 'calendly-webhook-signature': `t=${ts},v1=ZZ` } }),
        ),
      ).toBe(false);
    });
  });

  describe('lifecycle', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch');
    });
    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('onActivate POSTs /webhook_subscriptions and returns uri + signing_key', async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            resource: {
              uri: 'https://api.calendly.com/webhook_subscriptions/wh-1',
              signing_key: 'sk-1',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.example.com/v1/provider-webhooks/calendly/sub-1',
        connection: {
          id: 'c1',
          type: 'API_KEY',
          provider: 'calendly',
          config: { apiKey: 'pat-x' },
        },
        config: { scope: 'user', userUri: 'https://api.calendly.com/users/u1' },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      expect(result.providerSubId).toBe('https://api.calendly.com/webhook_subscriptions/wh-1');
      expect(result.signingSecret).toBe('sk-1');
    });

    it('throws when scope URI is missing', async () => {
      await expect(
        trigger.onActivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          callbackUrl: 'https://api.example.com/wh',
          connection: {
            id: 'c1',
            type: 'API_KEY',
            provider: 'calendly',
            config: { apiKey: 'pat-x' },
          },
          config: { scope: 'user' },
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).rejects.toThrow(/userUri/);
    });

    it('onDeactivate sends DELETE to the subscription URI; tolerates 404', async () => {
      fetchSpy.mockResolvedValue(new Response('', { status: 404 }));
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'https://api.calendly.com/webhook_subscriptions/wh-1',
          connection: {
            id: 'c1',
            type: 'API_KEY',
            provider: 'calendly',
            config: { apiKey: 'pat-x' },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).resolves.toBeUndefined();
    });
  });
});
