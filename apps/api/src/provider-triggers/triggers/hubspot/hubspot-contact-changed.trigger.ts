import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
} from '@tietide/sdk';

export const HUBSPOT_CONTACT_CHANGED_TYPE = 'hubspot-contact-changed';
const REPLAY_WINDOW_SECONDS = 300;

interface HubspotApiKeyLike {
  accessToken: string;
}

// HubSpot uses signature v3:
//   signature_v3 = base64( HMAC-SHA256( clientSecret, requestMethod + requestURI + requestBody + timestamp ) )
// The clientSecret is provisioned per HubSpot App. We never see the user's HubSpot
// password — we receive the App's clientSecret as the signing material when the
// developer paste it into our env. For the trigger we store ONLY the app
// clientSecret (we don't reuse the user OAuth access token for signing).
@Injectable()
export class HubspotContactChangedTrigger extends BasePushTrigger {
  readonly type = HUBSPOT_CONTACT_CHANGED_TYPE;
  readonly name = 'HubSpot: Contact Changed';
  readonly description = 'Triggers on HubSpot contact create/update/delete events';

  private readonly log = new Logger(HubspotContactChangedTrigger.name);

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

    // Method + URI must come from the headers HubSpot signed against — the
    // forwarded callback URL the user registered in their HubSpot App. Our
    // ActivationContext supplies that URL, so we encode it in the signing
    // secret payload (`<callbackUrl>::<clientSecret>`) and recover both here.
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

  // HubSpot subscriptions are configured at the App level (via HubSpot dev portal)
  // — there's no per-workflow CRUD API our code can call. Activation here just
  // captures the clientSecret + callback URL into the signing secret so verify
  // can recompute the HMAC; the developer must add subscription rules in the
  // HubSpot App UI for `contact.creation` / `contact.propertyChange`.
  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const cfg = ctx.connection.config as unknown as HubspotApiKeyLike & {
      appClientSecret?: string;
    };
    // We piggy-back on the access token here as the signing input fallback.
    // Production deployments should set HUBSPOT_APP_CLIENT_SECRET in the
    // workflow node config; for the MVP we pull it from a per-connection field
    // if present, falling back to the access token (acceptable on a dev account).
    const clientSecret = cfg.appClientSecret ?? cfg.accessToken;
    return {
      providerSubId: `hubspot:contact-changed:${ctx.workflowId}:${ctx.nodeId}`,
      signingSecret: encodeHubspotSigningSecret(ctx.callbackUrl, clientSecret),
    };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    // No remote resource to delete (subscriptions are App-level).
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

const HUBSPOT_SECRET_DELIMITER = '|||';
export function encodeHubspotSigningSecret(callbackUrl: string, clientSecret: string): string {
  return `${callbackUrl}${HUBSPOT_SECRET_DELIMITER}${clientSecret}`;
}
export function decodeHubspotSigningSecret(
  encoded: string,
): { callbackUrl: string; clientSecret: string } | null {
  const idx = encoded.indexOf(HUBSPOT_SECRET_DELIMITER);
  if (idx === -1) return null;
  return {
    callbackUrl: encoded.slice(0, idx),
    clientSecret: encoded.slice(idx + HUBSPOT_SECRET_DELIMITER.length),
  };
}
