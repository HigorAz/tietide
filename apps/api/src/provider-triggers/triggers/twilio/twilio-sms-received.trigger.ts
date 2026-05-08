import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
} from '@tietide/sdk';
import { TwilioApiError, TwilioApiFactory } from './twilio-client.factory';

export const TWILIO_SMS_RECEIVED_TYPE = 'twilio-sms-received';

interface TwilioApiKeyConfig {
  accountSid: string;
  authToken: string;
}

interface TwilioSmsReceivedNodeConfig {
  phoneNumberSid?: string;
}

// signingSecret format: "<authToken>|||<callbackUrl>" — verifySignature needs both
// the authToken (key for HMAC) and the URL Twilio used (input to HMAC). Embedding
// the URL in the signing-secret column keeps the ProviderSubscription schema flat.
const SECRET_DELIMITER = '|||';

export const encodeTwilioSigningSecret = (authToken: string, callbackUrl: string): string =>
  `${authToken}${SECRET_DELIMITER}${callbackUrl}`;

export const decodeTwilioSigningSecret = (
  secret: string,
): { authToken: string; callbackUrl: string } | null => {
  const idx = secret.indexOf(SECRET_DELIMITER);
  if (idx === -1) return null;
  const authToken = secret.slice(0, idx);
  const callbackUrl = secret.slice(idx + SECRET_DELIMITER.length);
  if (!authToken || !callbackUrl) return null;
  return { authToken, callbackUrl };
};

@Injectable()
export class TwilioSmsReceivedTrigger extends BasePushTrigger {
  readonly type = TWILIO_SMS_RECEIVED_TYPE;
  readonly name = 'Twilio: SMS Received';
  readonly description = 'Triggers when a Twilio phone number receives an inbound SMS';

  private readonly log = new Logger(TwilioSmsReceivedTrigger.name);

  constructor(private readonly twilio: TwilioApiFactory) {
    super();
  }

  // Twilio signature algorithm (sync): HMAC-SHA1(authToken).update(URL + sortedFormPairs)
  // where sortedFormPairs is the alphabetical concatenation of form keys+values.
  // See https://www.twilio.com/docs/usage/webhooks/webhooks-security
  verifySignature(input: SignatureInput): boolean {
    const decoded = decodeTwilioSigningSecret(input.signingSecret);
    if (!decoded) return false;
    const { authToken, callbackUrl } = decoded;

    const provided = this.extractHeader(input.headers, 'x-twilio-signature');
    if (!provided) return false;

    const params = this.parseFormBody(input.rawBody);
    const sortedKeys = Object.keys(params).sort();
    let concatenated = callbackUrl;
    for (const key of sortedKeys) {
      concatenated += key + params[key];
    }

    const expected = createHmac('sha1', authToken).update(concatenated, 'utf8').digest();

    let providedBuf: Buffer;
    try {
      providedBuf = Buffer.from(provided, 'base64');
    } catch {
      return false;
    }
    if (providedBuf.length !== expected.length) return false;
    return timingSafeEqual(providedBuf, expected);
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const conn = ctx.connection.config as unknown as TwilioApiKeyConfig;
    const node = (ctx.config ?? {}) as TwilioSmsReceivedNodeConfig;

    if (!node.phoneNumberSid) {
      throw new Error('twilio-sms-received: phoneNumberSid is required in node config');
    }

    // Update the IncomingPhoneNumber's SmsUrl/SmsMethod to point at our callback.
    const path = `/2010-04-01/Accounts/${conn.accountSid}/IncomingPhoneNumbers/${node.phoneNumberSid}.json`;
    const form = new URLSearchParams();
    form.set('SmsUrl', ctx.callbackUrl);
    form.set('SmsMethod', 'POST');

    await this.twilio.call(conn.accountSid, conn.authToken, path, {
      method: 'POST',
      body: form,
    });

    return {
      providerSubId: node.phoneNumberSid,
      signingSecret: encodeTwilioSigningSecret(conn.authToken, ctx.callbackUrl),
    };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    const conn = ctx.connection.config as unknown as TwilioApiKeyConfig;
    const path = `/2010-04-01/Accounts/${conn.accountSid}/IncomingPhoneNumbers/${ctx.providerSubId}.json`;
    const form = new URLSearchParams();
    form.set('SmsUrl', '');
    form.set('SmsMethod', 'POST');

    try {
      await this.twilio.call(conn.accountSid, conn.authToken, path, {
        method: 'POST',
        body: form,
      });
    } catch (err) {
      if (err instanceof TwilioApiError && err.response.status === 404) {
        this.log.warn(
          { providerSubId: ctx.providerSubId, workflowId: ctx.workflowId },
          'Twilio phone number not found; skipping deactivation',
        );
        return;
      }
      throw err;
    }
  }

  private extractHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | null {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== lower) continue;
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
    }
    return null;
  }

  private parseFormBody(rawBody: Uint8Array): Record<string, string> {
    const text = Buffer.from(rawBody).toString('utf8');
    const params: Record<string, string> = {};
    const pairs = new URLSearchParams(text);
    for (const [k, v] of pairs.entries()) {
      params[k] = v;
    }
    return params;
  }
}
