import { createHmac } from 'crypto';
import {
  HubspotContactChangedTrigger,
  encodeHubspotSigningSecret,
} from './hubspot-contact-changed.trigger';
import type { SignatureInput } from '@tietide/sdk';

const CALLBACK = 'https://api.example.com/v1/provider-webhooks/hubspot/sub-1';
const CLIENT_SECRET = 'app-client-secret';

function freshSignature(body: string, ts: number = Date.now()): { sig: string; ts: string } {
  const message = `POST${CALLBACK}${body}${ts}`;
  const sig = createHmac('sha256', CLIENT_SECRET).update(message).digest('base64');
  return { sig, ts: String(ts) };
}

function input(overrides: Partial<SignatureInput> = {}): SignatureInput {
  return {
    rawBody: new TextEncoder().encode('{"events":[]}'),
    headers: {},
    signingSecret: encodeHubspotSigningSecret(CALLBACK, CLIENT_SECRET),
    ...overrides,
  };
}

describe('HubspotContactChangedTrigger', () => {
  let trigger: HubspotContactChangedTrigger;

  beforeEach(() => {
    trigger = new HubspotContactChangedTrigger();
  });

  describe('verifySignature', () => {
    it('accepts a fresh signature', () => {
      const body = '{"events":[]}';
      const { sig, ts } = freshSignature(body);
      const result = trigger.verifySignature(
        input({
          rawBody: new TextEncoder().encode(body),
          headers: { 'x-hubspot-signature-v3': sig, 'x-hubspot-request-timestamp': ts },
        }),
      );
      expect(result).toBe(true);
    });

    it('rejects when body has been tampered', () => {
      const { sig, ts } = freshSignature('{"events":[]}');
      const result = trigger.verifySignature(
        input({
          rawBody: new TextEncoder().encode('{"events":["tampered"]}'),
          headers: { 'x-hubspot-signature-v3': sig, 'x-hubspot-request-timestamp': ts },
        }),
      );
      expect(result).toBe(false);
    });

    it('rejects timestamps outside 5-minute replay window', () => {
      const body = '{"events":[]}';
      const old = Date.now() - 6 * 60 * 1000;
      const { sig, ts } = freshSignature(body, old);
      const result = trigger.verifySignature(
        input({
          rawBody: new TextEncoder().encode(body),
          headers: { 'x-hubspot-signature-v3': sig, 'x-hubspot-request-timestamp': ts },
        }),
      );
      expect(result).toBe(false);
    });

    it('rejects when signature header is missing', () => {
      const result = trigger.verifySignature(input({ headers: {} }));
      expect(result).toBe(false);
    });

    it('rejects when timestamp header is missing', () => {
      const { sig } = freshSignature('{"events":[]}');
      const result = trigger.verifySignature(input({ headers: { 'x-hubspot-signature-v3': sig } }));
      expect(result).toBe(false);
    });

    it('rejects malformed signing secret', () => {
      const result = trigger.verifySignature(
        input({
          signingSecret: 'no-delimiter-bad-format',
          headers: {
            'x-hubspot-signature-v3': 'sig',
            'x-hubspot-request-timestamp': String(Date.now()),
          },
        }),
      );
      expect(result).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('onActivate returns deterministic providerSubId and encoded signing secret', async () => {
      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: CALLBACK,
        connection: {
          id: 'c1',
          type: 'OAUTH2',
          provider: 'hubspot',
          config: { accessToken: 'a', refreshToken: 'r', appClientSecret: CLIENT_SECRET },
        },
        config: {},
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });
      expect(result.providerSubId).toBe('hubspot:contact-changed:wf-1:node-1');
      expect(result.signingSecret).toContain(CALLBACK);
      expect(result.signingSecret).toContain(CLIENT_SECRET);
    });

    it('onDeactivate is a no-op (HubSpot subscriptions are App-level)', async () => {
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'hubspot:contact-changed:wf-1:node-1',
          connection: {
            id: 'c1',
            type: 'OAUTH2',
            provider: 'hubspot',
            config: { accessToken: 'a', refreshToken: 'r' },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).resolves.toBeUndefined();
    });
  });
});
