import { createHmac } from 'crypto';
import { TrelloCardChangedTrigger, encodeTrelloSigningSecret } from './trello-card-changed.trigger';
import type { SignatureInput } from '@tietide/sdk';

const API_SECRET = 'trello-secret';
const CALLBACK = 'https://api.example.com/v1/provider-webhooks/trello/sub-1';

function freshSig(body: string): string {
  return createHmac('sha1', API_SECRET)
    .update(body + CALLBACK)
    .digest('base64');
}

function input(overrides: Partial<SignatureInput> = {}): SignatureInput {
  return {
    rawBody: new TextEncoder().encode('{}'),
    headers: {},
    signingSecret: encodeTrelloSigningSecret(API_SECRET, CALLBACK),
    ...overrides,
  };
}

describe('TrelloCardChangedTrigger', () => {
  let trigger: TrelloCardChangedTrigger;

  beforeEach(() => {
    trigger = new TrelloCardChangedTrigger();
  });

  describe('verifySignature', () => {
    it('accepts a valid Trello signature (HMAC-SHA1 over body+callbackURL)', () => {
      const body = '{"action":{"type":"createCard"}}';
      expect(
        trigger.verifySignature(
          input({
            rawBody: new TextEncoder().encode(body),
            headers: { 'x-trello-webhook': freshSig(body) },
          }),
        ),
      ).toBe(true);
    });

    it('rejects tampered body', () => {
      const sig = freshSig('{"a":1}');
      expect(
        trigger.verifySignature(
          input({
            rawBody: new TextEncoder().encode('{"a":2}'),
            headers: { 'x-trello-webhook': sig },
          }),
        ),
      ).toBe(false);
    });

    it('rejects when signing secret is malformed', () => {
      expect(
        trigger.verifySignature(
          input({
            signingSecret: 'no-delimiter',
            headers: { 'x-trello-webhook': 'abc' },
          }),
        ),
      ).toBe(false);
    });

    it('rejects when signature header is missing', () => {
      expect(trigger.verifySignature(input({ headers: {} }))).toBe(false);
    });
  });

  describe('lifecycle', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch');
      process.env.TRELLO_API_SECRET = API_SECRET;
    });
    afterEach(() => {
      fetchSpy.mockRestore();
      delete process.env.TRELLO_API_SECRET;
    });

    it('onActivate POSTs /1/webhooks and returns id + encoded signing secret', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ id: 'webhook-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: CALLBACK,
        connection: {
          id: 'c1',
          type: 'API_KEY',
          provider: 'trello',
          config: { apiKey: 'devkey', token: 'usertoken' },
        },
        config: { modelId: '0123456789abcdef01234567' },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      expect(result.providerSubId).toBe('webhook-1');
      expect(result.signingSecret).toContain(API_SECRET);
      expect(result.signingSecret).toContain(CALLBACK);
    });

    it('throws when modelId is missing', async () => {
      await expect(
        trigger.onActivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          callbackUrl: CALLBACK,
          connection: {
            id: 'c1',
            type: 'API_KEY',
            provider: 'trello',
            config: { apiKey: 'devkey', token: 'usertoken' },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).rejects.toThrow(/modelId/);
    });

    it('onDeactivate calls DELETE /1/webhooks/:id; tolerates 404', async () => {
      fetchSpy.mockResolvedValue(new Response('', { status: 404 }));
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'webhook-1',
          connection: {
            id: 'c1',
            type: 'API_KEY',
            provider: 'trello',
            config: { apiKey: 'devkey', token: 'usertoken' },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).resolves.toBeUndefined();
    });
  });
});
