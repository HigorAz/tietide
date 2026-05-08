import { createHmac } from 'crypto';
import {
  TwilioSmsReceivedTrigger,
  encodeTwilioSigningSecret,
  decodeTwilioSigningSecret,
} from './twilio-sms-received.trigger';
import { TwilioApiError, type TwilioApiFactory } from './twilio-client.factory';

const AUTH_TOKEN = 'authtoken-12345';
const ACCOUNT_SID = 'AC-fakefakefakefakefakefakefakefak';
const PHONE_SID = 'PN-fakefakefakefakefakefakefakefak';
const CALLBACK_URL = 'https://api.tietide.dev/v1/provider-webhooks/twilio/sub-1';

const sampleParams = (): Record<string, string> => ({
  From: '+14155551234',
  To: '+14155555678',
  Body: 'hi',
  MessageSid: 'SM1',
});

const formEncode = (params: Record<string, string>): Buffer =>
  Buffer.from(new URLSearchParams(params).toString(), 'utf8');

const computeTwilioSig = (
  authToken: string,
  url: string,
  params: Record<string, string>,
): string => {
  const sortedKeys = Object.keys(params).sort();
  let s = url;
  for (const k of sortedKeys) s += k + params[k];
  return createHmac('sha1', authToken).update(s, 'utf8').digest('base64');
};

const makeFactory = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<TwilioApiFactory, 'call' | 'baseUrl'>> => ({
  call,
  baseUrl: jest.fn(),
});

describe('TwilioSmsReceivedTrigger', () => {
  let trigger: TwilioSmsReceivedTrigger;
  let call: jest.Mock;

  beforeEach(() => {
    call = jest.fn();
    trigger = new TwilioSmsReceivedTrigger(makeFactory(call) as unknown as TwilioApiFactory);
  });

  describe('signing-secret encode/decode', () => {
    it('roundtrips authToken and callback URL', () => {
      const enc = encodeTwilioSigningSecret(AUTH_TOKEN, CALLBACK_URL);
      const dec = decodeTwilioSigningSecret(enc);
      expect(dec).toEqual({ authToken: AUTH_TOKEN, callbackUrl: CALLBACK_URL });
    });
    it('returns null on missing delimiter', () => {
      expect(decodeTwilioSigningSecret('justatoken')).toBeNull();
    });
  });

  describe('verifySignature', () => {
    const signingSecret = encodeTwilioSigningSecret(AUTH_TOKEN, CALLBACK_URL);
    const params = sampleParams();
    const rawBody = formEncode(params);

    it('accepts a valid X-Twilio-Signature', () => {
      const sig = computeTwilioSig(AUTH_TOKEN, CALLBACK_URL, params);
      const headers = { 'x-twilio-signature': sig };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(true);
    });

    it('rejects when signature is missing', () => {
      expect(trigger.verifySignature({ rawBody, headers: {}, signingSecret })).toBe(false);
    });

    it('rejects when body is tampered', () => {
      const sig = computeTwilioSig(AUTH_TOKEN, CALLBACK_URL, params);
      const tampered = formEncode({ ...params, Body: 'mutated' });
      expect(
        trigger.verifySignature({
          rawBody: tampered,
          headers: { 'x-twilio-signature': sig },
          signingSecret,
        }),
      ).toBe(false);
    });

    it('rejects when authToken is wrong (signature recomputed differs)', () => {
      const sig = computeTwilioSig('different-token', CALLBACK_URL, params);
      expect(
        trigger.verifySignature({
          rawBody,
          headers: { 'x-twilio-signature': sig },
          signingSecret,
        }),
      ).toBe(false);
    });

    it('rejects mismatched signature length without timing-leak', () => {
      const headers = { 'x-twilio-signature': Buffer.from('shortsig').toString('base64') };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(false);
    });

    it('returns false when signing secret is malformed', () => {
      const sig = computeTwilioSig(AUTH_TOKEN, CALLBACK_URL, params);
      expect(
        trigger.verifySignature({
          rawBody,
          headers: { 'x-twilio-signature': sig },
          signingSecret: 'notvalid',
        }),
      ).toBe(false);
    });
  });

  describe('onActivate', () => {
    it('updates SmsUrl/SmsMethod on the IncomingPhoneNumber and returns providerSubId + signingSecret', async () => {
      call.mockResolvedValue({ status: 200, data: {} });

      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: CALLBACK_URL,
        connection: {
          id: 'conn-1',
          type: 'API_KEY',
          provider: 'twilio',
          config: { accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN },
        },
        config: { phoneNumberSid: PHONE_SID },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      expect(call).toHaveBeenCalledTimes(1);
      const [sid, token, path, init] = call.mock.calls[0];
      expect(sid).toBe(ACCOUNT_SID);
      expect(token).toBe(AUTH_TOKEN);
      expect(path).toBe(
        `/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers/${PHONE_SID}.json`,
      );
      expect((init.body as URLSearchParams).get('SmsUrl')).toBe(CALLBACK_URL);

      expect(result.providerSubId).toBe(PHONE_SID);
      expect(decodeTwilioSigningSecret(result.signingSecret)).toEqual({
        authToken: AUTH_TOKEN,
        callbackUrl: CALLBACK_URL,
      });
    });

    it('rejects when phoneNumberSid is missing from node config', async () => {
      await expect(
        trigger.onActivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          callbackUrl: CALLBACK_URL,
          connection: {
            id: 'conn-1',
            type: 'API_KEY',
            provider: 'twilio',
            config: { accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).rejects.toThrow(/phoneNumberSid/i);
    });
  });

  describe('onDeactivate', () => {
    it('clears SmsUrl on the phone number', async () => {
      call.mockResolvedValue({ status: 200, data: {} });
      await trigger.onDeactivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        providerSubId: PHONE_SID,
        connection: {
          id: 'conn-1',
          type: 'API_KEY',
          provider: 'twilio',
          config: { accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN },
        },
        config: {},
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });
      const [, , path, init] = call.mock.calls[0];
      expect(path).toBe(
        `/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers/${PHONE_SID}.json`,
      );
      expect((init.body as URLSearchParams).get('SmsUrl')).toBe('');
    });

    it('idempotently swallows 404 (phone number gone)', async () => {
      call.mockRejectedValue(new TwilioApiError(404, { code: 20404 }));
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'PNgone',
          connection: {
            id: 'conn-1',
            type: 'API_KEY',
            provider: 'twilio',
            config: { accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).resolves.not.toThrow();
    });
  });
});
