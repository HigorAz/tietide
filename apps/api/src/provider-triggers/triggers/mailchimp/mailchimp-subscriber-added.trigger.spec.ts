import { MailchimpSubscriberAddedTrigger } from './mailchimp-subscriber-added.trigger';
import type { SignatureInput } from '@tietide/sdk';

const SECRET = 'tok-abc-12345';

function input(overrides: Partial<SignatureInput> = {}): SignatureInput {
  return {
    rawBody: new TextEncoder().encode('{}'),
    headers: {},
    signingSecret: SECRET,
    ...overrides,
  };
}

describe('MailchimpSubscriberAddedTrigger', () => {
  let trigger: MailchimpSubscriberAddedTrigger;

  beforeEach(() => {
    trigger = new MailchimpSubscriberAddedTrigger();
  });

  describe('verifySignature', () => {
    it('accepts when the server-parsed query secret matches the stored secret', () => {
      expect(trigger.verifySignature(input({ query: { secret: SECRET } }))).toBe(true);
    });

    it('does NOT trust a client-supplied header (forgery vector) — only the server query', () => {
      // An attacker putting the secret in a header must NOT pass; the secret
      // must come from the server-parsed query string.
      expect(
        trigger.verifySignature(
          input({
            headers: {
              'x-tietide-callback-secret': SECRET,
              'x-original-url': `https://x/?secret=${SECRET}`,
            },
            query: {},
          }),
        ),
      ).toBe(false);
    });

    it('rejects when the query secret does not match', () => {
      expect(trigger.verifySignature(input({ query: { secret: 'wrong' } }))).toBe(false);
    });

    it('rejects when no secret is provided', () => {
      expect(trigger.verifySignature(input({ query: {} }))).toBe(false);
    });
  });

  describe('handleValidation', () => {
    it('returns 200 plain on ping=1 query', () => {
      const result = trigger.handleValidation({
        query: { ping: '1' },
        headers: {},
        rawBody: new Uint8Array(),
      });
      expect(result).not.toBeNull();
      expect(result?.body).toBe('');
    });

    it('returns null when not a ping', () => {
      expect(
        trigger.handleValidation({ query: {}, headers: {}, rawBody: new Uint8Array() }),
      ).toBeNull();
    });
  });

  describe('onActivate / onDeactivate', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch');
    });
    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('POSTs to /3.0/lists/<id>/webhooks and returns webhook id + secret', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ id: 'webhook-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.example.com/v1/provider-webhooks/mailchimp/sub-1',
        connection: {
          id: 'c1',
          type: 'API_KEY',
          provider: 'mailchimp',
          config: { apiKey: 'k-us1', dataCenter: 'us1' },
        },
        config: { listId: 'abc1234567' },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      expect(result.providerSubId).toBe('webhook-1');
      expect(result.signingSecret.length).toBeGreaterThan(0);

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://us1.api.mailchimp.com/3.0/lists/abc1234567/webhooks');
      const body = JSON.parse(init.body);
      // Callback should have the generated secret appended.
      expect(body.url).toContain('secret=');
    });

    it('throws when listId is missing', async () => {
      await expect(
        trigger.onActivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          callbackUrl: 'https://api.example.com',
          connection: {
            id: 'c1',
            type: 'API_KEY',
            provider: 'mailchimp',
            config: { apiKey: 'k', dataCenter: 'us1' },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).rejects.toThrow(/listId/);
    });

    it('onDeactivate calls DELETE; tolerates 404', async () => {
      fetchSpy.mockResolvedValue(new Response('', { status: 404 }));
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'webhook-1',
          connection: {
            id: 'c1',
            type: 'API_KEY',
            provider: 'mailchimp',
            config: { apiKey: 'k', dataCenter: 'us1' },
          },
          config: { listId: 'abc1234567' },
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).resolves.toBeUndefined();
    });
  });
});
