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

interface SlackOAuth2Config {
  accessToken: string;
  teamId: string;
  botUserId: string;
  scope: string;
  signingSecret?: string;
}

const SLACK_REPLAY_WINDOW_SECONDS = 300;

/**
 * Shared base for the two Slack push triggers.
 *
 * Slack identity differs from other providers: there is no per-subscription
 * provider-side resource we create or destroy. The Events API URL is set in the
 * Slack App dashboard once. What we actually persist as `signingSecret` IS the
 * App's signing secret (which the user pastes into the connection). We re-write
 * it on every onActivate so users updating the secret post-install propagate it.
 */
export abstract class SlackBaseTrigger extends BasePushTrigger {
  protected readonly log: Logger;

  constructor(loggerScope: string) {
    super();
    this.log = new Logger(loggerScope);
  }

  // Slack v0 scheme: sig = "v0=" + HMAC-SHA256(signingSecret, "v0:" + ts + ":" + rawBody).
  // Replay window 5 minutes. https://api.slack.com/authentication/verifying-requests-from-slack
  verifySignature(input: SignatureInput): boolean {
    const ts = this.extractHeader(input.headers, 'x-slack-request-timestamp');
    const sig = this.extractHeader(input.headers, 'x-slack-signature');
    if (!ts || !sig) return false;

    const tsNum = Number.parseInt(ts, 10);
    if (!Number.isFinite(tsNum)) return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - tsNum) > SLACK_REPLAY_WINDOW_SECONDS) return false;

    const body = Buffer.from(input.rawBody).toString('utf8');
    const expectedHex = createHmac('sha256', input.signingSecret)
      .update(`v0:${ts}:${body}`)
      .digest('hex');
    const expected = Buffer.from(`v0=${expectedHex}`, 'utf8');
    const provided = Buffer.from(sig, 'utf8');
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  }

  // Slack's URL verification handshake fires at app dashboard URL save time.
  // We answer the challenge BEFORE looking up any subscription so no DB row
  // needs to exist yet.
  handleValidation(input: ValidationInput): ValidationResponse | null {
    if (input.rawBody.byteLength === 0) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(input.rawBody).toString('utf8'));
    } catch {
      return null;
    }
    const obj = parsed as { type?: unknown; challenge?: unknown } | null;
    if (obj && obj.type === 'url_verification' && typeof obj.challenge === 'string') {
      return { body: obj.challenge, contentType: 'text/plain' };
    }
    return null;
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const conn = ctx.connection.config as unknown as SlackOAuth2Config;
    const signingSecret = typeof conn.signingSecret === 'string' ? conn.signingSecret : '';
    if (!signingSecret) {
      throw new Error(
        `Slack connection is missing signingSecret. ` +
          `Open the connection in TieTide and paste the Slack App "Signing Secret" before activating ${this.type}.`,
      );
    }
    return {
      providerSubId: `slack-events:${conn.teamId}:${this.type}`,
      signingSecret,
    };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    // No remote resource to delete — Slack Events API URL is configured in the
    // Slack App dashboard. Document this in deployment.md so users know to
    // remove the URL there if they no longer want events delivered.
    this.log.debug(
      { workflowId: ctx.workflowId, providerSubId: ctx.providerSubId },
      'Slack push trigger deactivated; Slack App Events URL must be removed manually',
    );
  }

  protected extractHeader(
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
