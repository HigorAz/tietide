import { Injectable, Logger } from '@nestjs/common';
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

export const TRELLO_CARD_CHANGED_TYPE = 'trello-card-changed';

interface TrelloApiKeyConfig {
  apiKey: string;
  token: string;
}

interface TrelloNodeConfig {
  modelId?: string;
  eventType?: string;
}

// Trello signs each webhook delivery with HMAC-SHA1.
//   header `x-trello-webhook: base64( HMAC-SHA1( apiSecret, body + callbackURL ) )`
// Note: callbackURL is appended to the body BEFORE HMAC. The signing material is
// the API secret (developer-level secret), not the user token. We persist
// `<apiSecret>|||<callbackUrl>` so verifySignature can recompute the HMAC.
//
// Trello also sends a HEAD request to validate URL reachability before creating
// the webhook — handleValidation responds 200 to that.
@Injectable()
export class TrelloCardChangedTrigger extends BasePushTrigger {
  readonly type = TRELLO_CARD_CHANGED_TYPE;
  readonly name = 'Trello: Card Changed';
  readonly description =
    'Triggers on Trello board events (card create / update / comment / member changes)';

  private readonly log = new Logger(TrelloCardChangedTrigger.name);

  // Trello uses HEAD to verify URL ownership; we cannot answer that here
  // (handleValidation only fires on POST in our controller). The controller
  // change adds a separate HEAD route for `/v1/provider-webhooks/:provider/...`
  // that returns 200 unconditionally. handleValidation is left undefined so
  // POST requests proceed to verifySignature normally.
  handleValidation(_input: ValidationInput): ValidationResponse | null {
    void _input;
    return null;
  }

  verifySignature(input: SignatureInput): boolean {
    const sig = this.headerOf(input.headers, 'x-trello-webhook');
    if (!sig) return false;

    const decoded = decodeTrelloSigningSecret(input.signingSecret);
    if (!decoded) return false;

    const body = Buffer.from(input.rawBody).toString('utf8');
    // codeql[js/weak-cryptographic-algorithm] — required, not a choice: Trello signs
    // webhooks with HMAC-SHA1 (X-Trello-Webhook), so verification MUST use SHA1 to
    // match. Compared in constant time via timingSafeEqual below.
    const expected = createHmac('sha1', decoded.apiSecret)
      .update(body + decoded.callbackUrl)
      .digest('base64');

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
    const cfg = ctx.connection.config as unknown as TrelloApiKeyConfig;
    const node = (ctx.config ?? {}) as TrelloNodeConfig;
    if (!node.modelId) throw new Error('Trello trigger requires modelId in node config');

    const url = new URL('https://api.trello.com/1/webhooks');
    url.searchParams.set('key', cfg.apiKey);
    url.searchParams.set('token', cfg.token);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idModel: node.modelId,
        callbackURL: ctx.callbackUrl,
        description: `tietide:${ctx.workflowId}:${ctx.nodeId}`,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Trello webhook create failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as { id?: string };
    if (!json.id) throw new Error('Trello webhook create did not return an id');

    // Trello webhooks are signed with the developer's API secret (not the user
    // token). The user's connection holds `apiKey` (= dev key) + `token` (=
    // user OAuth-like token). We need a SEPARATE secret to verify HMAC. By
    // Trello's contract the API secret is public-shareable per developer
    // account, so we pass it through env.
    // Trello signs deliveries with the developer API secret — NOT the user
    // token. Falling back to cfg.token stored the wrong signing material (real
    // deliveries would 401, and the user token would be repurposed as a webhook
    // key). Require the real secret and fail activation loudly if it's absent.
    const apiSecret = process.env.TRELLO_API_SECRET;
    if (!apiSecret) {
      throw new Error(
        'TRELLO_API_SECRET is not configured — cannot verify Trello webhook signatures. ' +
          'Set it to your Trello developer API secret before activating Trello triggers.',
      );
    }

    return {
      providerSubId: json.id,
      signingSecret: encodeTrelloSigningSecret(apiSecret, ctx.callbackUrl),
    };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    const cfg = ctx.connection.config as unknown as TrelloApiKeyConfig;
    const url = new URL(`https://api.trello.com/1/webhooks/${ctx.providerSubId}`);
    url.searchParams.set('key', cfg.apiKey);
    url.searchParams.set('token', cfg.token);

    const res = await fetch(url.toString(), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      this.log.warn(
        { providerSubId: ctx.providerSubId, status: res.status, body: text },
        'Trello webhook delete failed',
      );
    }
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

const TRELLO_DELIM = '|||';
export function encodeTrelloSigningSecret(apiSecret: string, callbackUrl: string): string {
  return `${apiSecret}${TRELLO_DELIM}${callbackUrl}`;
}
export function decodeTrelloSigningSecret(
  encoded: string,
): { apiSecret: string; callbackUrl: string } | null {
  const idx = encoded.indexOf(TRELLO_DELIM);
  if (idx === -1) return null;
  return {
    apiSecret: encoded.slice(0, idx),
    callbackUrl: encoded.slice(idx + TRELLO_DELIM.length),
  };
}
