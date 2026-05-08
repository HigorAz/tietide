import {
  GmailMessageReceivedTrigger,
  GMAIL_MESSAGE_RECEIVED_TYPE,
} from './gmail-message-received.trigger';
import type { GoogleClientFactory } from './google/google-client.factory';

interface GmailMockHandle {
  watch: jest.Mock;
  stop: jest.Mock;
}

function makeFactory(handle: GmailMockHandle): jest.Mocked<GoogleClientFactory> {
  return {
    drive: jest.fn(),
    gmail: jest.fn(() => ({
      users: { watch: handle.watch, stop: handle.stop },
    })) as unknown as jest.Mock,
    verifyOidcToken: jest.fn(),
  } as unknown as jest.Mocked<GoogleClientFactory>;
}

const baseLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const baseConnection = {
  id: 'conn-1',
  type: 'OAUTH2',
  provider: 'google',
  config: {
    accessToken: 'at',
    refreshToken: 'rt',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    tokenType: 'Bearer',
  },
  refreshToken: 'rt',
};

const PUSH_SERVICE_EMAIL = 'gmail-api-push@system.gserviceaccount.com';
const CALLBACK_URL = 'https://api.tietide.dev/v1/provider-webhooks/google/sub-1';

describe('GmailMessageReceivedTrigger', () => {
  let trigger: GmailMessageReceivedTrigger;
  let gmail: GmailMockHandle;
  let factory: jest.Mocked<GoogleClientFactory>;

  beforeEach(() => {
    gmail = { watch: jest.fn(), stop: jest.fn() };
    factory = makeFactory(gmail);
    trigger = new GmailMessageReceivedTrigger(factory);
    jest.useFakeTimers().setSystemTime(new Date('2026-05-08T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exports the canonical type string', () => {
    expect(GMAIL_MESSAGE_RECEIVED_TYPE).toBe('gmail-message-received');
    expect(trigger.type).toBe('gmail-message-received');
  });

  describe('verifySignature', () => {
    const rawBody = Buffer.from(
      JSON.stringify({ message: { data: 'eyJoaXN0b3J5SWQiOiI1MDAifQ==' } }),
    );
    const signingSecret = `${CALLBACK_URL}::oidc`;

    it('accepts a valid OIDC JWT whose audience matches and email is the Gmail push service', async () => {
      factory.verifyOidcToken.mockResolvedValue({
        email: PUSH_SERVICE_EMAIL,
        email_verified: true,
        aud: CALLBACK_URL,
      } as never);

      const headers = { authorization: 'Bearer fake.jwt.signature' };
      // verifySignature returns boolean | Promise<boolean> (per @tietide/sdk
      // 2.2.0 widening). The dispatcher awaits it; the test must too.
      const result = await Promise.resolve(
        trigger.verifySignature({ rawBody, headers, signingSecret }),
      );
      expect(result).toBe(true);
    });

    it('rejects when Authorization header is missing', () => {
      expect(trigger.verifySignature({ rawBody, headers: {}, signingSecret })).toBe(false);
    });

    it('rejects when the bearer token is not a JWT-shaped string', () => {
      const headers = { authorization: 'Bearer not-a-jwt' };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(false);
    });
  });

  describe('verifyOidcAsync (async path)', () => {
    const rawBody = Buffer.from('{}');
    const signingSecret = `${CALLBACK_URL}::oidc`;

    it('rejects when the JWT email is not the Gmail push service', async () => {
      factory.verifyOidcToken.mockResolvedValue({
        email: 'attacker@example.com',
        email_verified: true,
        aud: CALLBACK_URL,
      } as never);

      const result = await trigger.verifyOidcAsync({
        rawBody,
        headers: { authorization: 'Bearer aaa.bbb.ccc' },
        signingSecret,
      });
      expect(result).toBe(false);
    });

    it('rejects when email_verified is false', async () => {
      factory.verifyOidcToken.mockResolvedValue({
        email: PUSH_SERVICE_EMAIL,
        email_verified: false,
        aud: CALLBACK_URL,
      } as never);

      const result = await trigger.verifyOidcAsync({
        rawBody,
        headers: { authorization: 'Bearer aaa.bbb.ccc' },
        signingSecret,
      });
      expect(result).toBe(false);
    });

    it('rejects when verifyIdToken throws (invalid signature, expired, etc.)', async () => {
      factory.verifyOidcToken.mockRejectedValue(new Error('Invalid token signature'));

      const result = await trigger.verifyOidcAsync({
        rawBody,
        headers: { authorization: 'Bearer aaa.bbb.ccc' },
        signingSecret,
      });
      expect(result).toBe(false);
    });

    it('passes the audience derived from signingSecret to verifyIdToken', async () => {
      factory.verifyOidcToken.mockResolvedValue({
        email: PUSH_SERVICE_EMAIL,
        email_verified: true,
        aud: CALLBACK_URL,
      } as never);

      await trigger.verifyOidcAsync({
        rawBody,
        headers: { authorization: 'Bearer aaa.bbb.ccc' },
        signingSecret,
      });

      expect(factory.verifyOidcToken).toHaveBeenCalledWith('aaa.bbb.ccc', CALLBACK_URL);
    });
  });

  describe('onActivate', () => {
    it('calls users.watch with topicName + labelIds and returns providerSubId/historyId + 6.5d expiry', async () => {
      gmail.watch.mockResolvedValue({
        data: { historyId: '900', expiration: String(Date.now() + 6.5 * 24 * 60 * 60 * 1000) },
      });

      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: CALLBACK_URL,
        connection: baseConnection,
        config: {
          topicName: 'projects/my-proj/topics/gmail-watch',
          labelIds: ['INBOX'],
          labelFilterAction: 'include',
        },
        logger: baseLogger,
      });

      expect(factory.gmail).toHaveBeenCalledWith(baseConnection);
      expect(gmail.watch).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          topicName: 'projects/my-proj/topics/gmail-watch',
          labelIds: ['INBOX'],
          labelFilterAction: 'INCLUDE',
        },
      });
      expect(result.providerSubId).toBe('900');
      // signingSecret encodes the callback URL so verifySignature can derive audience
      expect(result.signingSecret).toContain(CALLBACK_URL);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws when topicName is missing', async () => {
      await expect(
        trigger.onActivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          callbackUrl: CALLBACK_URL,
          connection: baseConnection,
          config: {},
          logger: baseLogger,
        }),
      ).rejects.toThrow(/topicName/);
    });
  });

  describe('onDeactivate', () => {
    it('calls users.stop on the connection', async () => {
      gmail.stop.mockResolvedValue({});
      await trigger.onDeactivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        providerSubId: '900',
        connection: baseConnection,
        config: {},
        logger: baseLogger,
      });
      expect(gmail.stop).toHaveBeenCalledWith({ userId: 'me' });
    });

    it('is idempotent on 404 (watch already stopped)', async () => {
      const err = Object.assign(new Error('Not found'), { code: 404 });
      gmail.stop.mockRejectedValue(err);

      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: '900',
          connection: baseConnection,
          config: {},
          logger: baseLogger,
        }),
      ).resolves.not.toThrow();
    });

    it('throws on non-404 errors', async () => {
      const err = Object.assign(new Error('Internal'), { code: 500 });
      gmail.stop.mockRejectedValue(err);

      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: '900',
          connection: baseConnection,
          config: {},
          logger: baseLogger,
        }),
      ).rejects.toThrow('Internal');
    });
  });
});
