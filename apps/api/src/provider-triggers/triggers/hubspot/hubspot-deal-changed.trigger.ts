import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
} from '@tietide/sdk';
import {
  encodeHubspotSigningSecret,
  decodeHubspotSigningSecret,
} from './hubspot-contact-changed.trigger';

export const HUBSPOT_DEAL_CHANGED_TYPE = 'hubspot-deal-changed';
const REPLAY_WINDOW_SECONDS = 300;

interface HubspotApiKeyLike {
  accessToken: string;
}

// Complements hubspot-contact-changed for deal objects. HubSpot signs all app
// webhooks with the same signature-v3 scheme, so verification is identical; only
// the subscription rules (deal.creation / deal.propertyChange …) differ, and those
// are configured by the developer in the HubSpot App UI (App-level subscriptions).
@Injectable()
export class HubspotDealChangedTrigger extends BasePushTrigger {
  readonly type = HUBSPOT_DEAL_CHANGED_TYPE;
  readonly name = 'HubSpot: Deal Changed';
  readonly description = 'Triggers on HubSpot deal create/update/delete events';

  private readonly log = new Logger(HubspotDealChangedTrigger.name);

  verifySignature(input: SignatureInput): boolean {
    const sig = this.extractHeader(input.headers, 'x-hubspot-signature-v3');
    const ts = this.extractHeader(input.headers, 'x-hubspot-request-timestamp');
    if (!sig || !ts) return false;

    const timestamp = Number.parseInt(ts, 10);
    if (!Number.isFinite(timestamp)) return false;

    const nowMs = Date.now();
    if (Math.abs(nowMs - timestamp) > REPLAY_WINDOW_SECONDS * 1000) {
      return false;
    }

    const decoded = decodeHubspotSigningSecret(input.signingSecret);
    if (!decoded) return false;

    const body = Buffer.from(input.rawBody).toString('utf8');
    const message = `POST${decoded.callbackUrl}${body}${ts}`;

    const expected = createHmac('sha256', decoded.clientSecret).update(message).digest('base64');

    let provided: Buffer;
    try {
      provided = Buffer.from(sig, 'base64');
    } catch {
      return false;
    }
    const exp = Buffer.from(expected, 'base64');
    if (provided.length !== exp.length) return false;
    return timingSafeEqual(provided, exp);
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const cfg = ctx.connection.config as unknown as HubspotApiKeyLike & {
      appClientSecret?: string;
    };
    // Sign with the HubSpot App client secret, never the user access token.
    const clientSecret = cfg.appClientSecret ?? process.env.HUBSPOT_APP_CLIENT_SECRET;
    if (!clientSecret) {
      throw new Error(
        'HubSpot App client secret is not configured (connection appClientSecret or ' +
          'HUBSPOT_APP_CLIENT_SECRET) — cannot verify HubSpot webhook signatures.',
      );
    }
    return {
      providerSubId: `hubspot:deal-changed:${ctx.workflowId}:${ctx.nodeId}`,
      signingSecret: encodeHubspotSigningSecret(ctx.callbackUrl, clientSecret),
    };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    this.log.debug(
      { providerSubId: ctx.providerSubId, workflowId: ctx.workflowId },
      'HubSpot subscription is App-level; nothing to delete remotely',
    );
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
}
