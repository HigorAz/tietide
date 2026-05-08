import { createHmac } from 'crypto';
import { SlackMessageReceivedTrigger } from './slack-message-received.trigger';

const SIGNING_SECRET = 'app-signing-secret-test';
const TEAM_ID = 'T0123ABCDEF';
const BOT_USER_ID = 'U0123ABCDEF';

const slackHeaders = (
  rawBody: Buffer,
  ts: number = Math.floor(Date.now() / 1000),
  secret: string = SIGNING_SECRET,
): Record<string, string> => {
  const sig = createHmac('sha256', secret)
    .update(`v0:${ts}:${rawBody.toString('utf8')}`)
    .digest('hex');
  return {
    'x-slack-request-timestamp': String(ts),
    'x-slack-signature': `v0=${sig}`,
  };
};

describe('SlackBaseTrigger (via SlackMessageReceivedTrigger)', () => {
  let trigger: SlackMessageReceivedTrigger;

  beforeEach(() => {
    trigger = new SlackMessageReceivedTrigger();
    jest.useFakeTimers().setSystemTime(1717000000000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('verifySignature', () => {
    const rawBody = Buffer.from(
      JSON.stringify({ type: 'event_callback', event: { type: 'message', text: 'hi' } }),
    );

    it('accepts a valid v0 signature within replay window', () => {
      const headers = slackHeaders(rawBody);
      expect(trigger.verifySignature({ rawBody, headers, signingSecret: SIGNING_SECRET })).toBe(
        true,
      );
    });

    it('rejects when timestamp is outside the 5-minute replay window', () => {
      const oldTs = Math.floor(Date.now() / 1000) - 600;
      const headers = slackHeaders(rawBody, oldTs);
      expect(trigger.verifySignature({ rawBody, headers, signingSecret: SIGNING_SECRET })).toBe(
        false,
      );
    });

    it('rejects when body is tampered after signing', () => {
      const headers = slackHeaders(rawBody);
      const tampered = Buffer.from(
        JSON.stringify({ type: 'event_callback', event: { type: 'message', text: 'malicious' } }),
      );
      expect(
        trigger.verifySignature({ rawBody: tampered, headers, signingSecret: SIGNING_SECRET }),
      ).toBe(false);
    });

    it('rejects when signing secret differs', () => {
      const headers = slackHeaders(rawBody, undefined, 'wrong-secret');
      expect(trigger.verifySignature({ rawBody, headers, signingSecret: SIGNING_SECRET })).toBe(
        false,
      );
    });

    it('rejects when headers are missing', () => {
      expect(trigger.verifySignature({ rawBody, headers: {}, signingSecret: SIGNING_SECRET })).toBe(
        false,
      );
    });

    it('rejects when timestamp header is non-numeric', () => {
      const headers = {
        'x-slack-request-timestamp': 'banana',
        'x-slack-signature': 'v0=00',
      };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret: SIGNING_SECRET })).toBe(
        false,
      );
    });
  });

  describe('handleValidation (Slack url_verification)', () => {
    it('returns the challenge for url_verification body', () => {
      const challenge = 'challenge-string-12345';
      const rawBody = Buffer.from(JSON.stringify({ type: 'url_verification', challenge }));
      const result = trigger.handleValidation!({ query: {}, headers: {}, rawBody });
      expect(result).toEqual({ body: challenge, contentType: 'text/plain' });
    });

    it('returns null for non-handshake bodies', () => {
      const rawBody = Buffer.from(JSON.stringify({ type: 'event_callback' }));
      expect(trigger.handleValidation!({ query: {}, headers: {}, rawBody })).toBeNull();
    });

    it('returns null on malformed JSON', () => {
      expect(
        trigger.handleValidation!({ query: {}, headers: {}, rawBody: Buffer.from('{not json') }),
      ).toBeNull();
    });

    it('returns null on empty body', () => {
      expect(
        trigger.handleValidation!({ query: {}, headers: {}, rawBody: Buffer.from('') }),
      ).toBeNull();
    });
  });

  describe('onActivate', () => {
    const baseConn = (signingSecret?: string) => ({
      id: 'conn-1',
      type: 'OAUTH2',
      provider: 'slack',
      config: {
        accessToken: 'xoxb',
        teamId: TEAM_ID,
        botUserId: BOT_USER_ID,
        scope: 'chat:write,channels:history',
        signingSecret,
      },
    });

    it('returns providerSubId derived from teamId+type and the connection signing secret', async () => {
      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/slack/sub-1',
        connection: baseConn(SIGNING_SECRET),
        config: { channelId: 'C0123ABCDEF' },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });
      expect(result.signingSecret).toBe(SIGNING_SECRET);
      expect(result.providerSubId).toBe(`slack-events:${TEAM_ID}:slack-message-received`);
    });

    it('throws a clear error when signingSecret is missing from the connection', async () => {
      await expect(
        trigger.onActivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/slack/sub-1',
          connection: baseConn(undefined),
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).rejects.toThrow(/signingSecret/i);
    });
  });

  describe('onDeactivate', () => {
    it('does not throw and does not call any external API', async () => {
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'slack-events:T:slack-message-received',
          connection: {
            id: 'conn-1',
            type: 'OAUTH2',
            provider: 'slack',
            config: {
              accessToken: 'xoxb',
              teamId: TEAM_ID,
              botUserId: BOT_USER_ID,
              scope: '',
              signingSecret: SIGNING_SECRET,
            },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).resolves.not.toThrow();
    });
  });
});
