import { Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
  type ValidationInput,
  type ValidationResponse,
} from '@tietide/sdk';

export const WHATSAPP_MESSAGE_RECEIVED_TYPE = 'whatsapp-message-received';

/**
 * WhatsApp Business (Meta Graph) inbound-message webhook trigger.
 *
 * Meta uses a SINGLE app-level callback URL configured once in the App
 * Dashboard, so there is no per-subscription remote resource to create —
 * onActivate just returns the Meta app secret (which signs deliveries) for
 * encrypted storage, Slack-style. Two verification surfaces:
 *  - GET handshake (`?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`)
 *    answered by handleSubscriptionVerification.
 *  - POST deliveries signed `X-Hub-Signature-256: sha256=…` over the raw body
 *    with the app secret (identical scheme to GitHub).
 */
export class WhatsappMessageReceivedTrigger extends BasePushTrigger {
  readonly type = WHATSAPP_MESSAGE_RECEIVED_TYPE;
  readonly name = 'WhatsApp: Message Received';
  readonly description =
    'Triggers when an inbound message arrives on your WhatsApp Business number (Meta webhook)';

  private readonly log = new Logger(WhatsappMessageReceivedTrigger.name);

  verifySignature(input: SignatureInput): boolean {
    const header = this.headerOf(input.headers, 'x-hub-signature-256');
    if (!header || !header.startsWith('sha256=')) return false;

    const expectedHex = createHmac('sha256', input.signingSecret)
      .update(Buffer.from(input.rawBody))
      .digest('hex');

    let provided: Buffer;
    let expected: Buffer;
    try {
      provided = Buffer.from(header.slice('sha256='.length), 'hex');
      expected = Buffer.from(expectedHex, 'hex');
    } catch {
      return false;
    }
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  }

  // Meta's webhook subscription handshake: a GET with the configured verify
  // token. Echo the challenge as text/plain only when the token matches.
  handleSubscriptionVerification(input: ValidationInput): ValidationResponse | null {
    const mode = this.firstQuery(input.query['hub.mode']);
    const token = this.firstQuery(input.query['hub.verify_token']);
    const challenge = this.firstQuery(input.query['hub.challenge']);
    if (mode !== 'subscribe' || challenge === null) return null;

    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN ?? '';
    if (expected.length === 0 || token === null) return null;
    if (!this.constantTimeEquals(token, expected)) return null;

    return { body: challenge, contentType: 'text/plain' };
  }

  async onActivate(_ctx: ActivationContext): Promise<ActivationResult> {
    const appSecret = process.env.META_APP_SECRET ?? '';
    if (appSecret.length === 0) {
      throw new Error(
        'WhatsApp trigger requires META_APP_SECRET to be configured so inbound webhook ' +
          'signatures (X-Hub-Signature-256) can be verified.',
      );
    }
    // No remote resource: the webhook URL is registered once in the Meta App
    // Dashboard. We persist the app secret as the signing secret.
    return { providerSubId: `meta-whatsapp:${this.type}`, signingSecret: appSecret };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    this.log.debug(
      { workflowId: ctx.workflowId, providerSubId: ctx.providerSubId },
      'WhatsApp push trigger deactivated; remove the callback URL in the Meta App Dashboard manually',
    );
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }

  private firstQuery(value: string | string[] | undefined): string | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') return value[0];
    return null;
  }

  private headerOf(
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
}
