import { Injectable, Logger } from '@nestjs/common';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
} from '@tietide/sdk';
import { GoogleClientFactory } from './google/google-client.factory';

export const GMAIL_MESSAGE_RECEIVED_TYPE = 'gmail-message-received';

// Gmail watch responses set an `expiration` ms timestamp; max ~7 days.
// We don't override — we trust whatever Gmail returns and let the renewer
// rotate before expiry.
const PUSH_SERVICE_EMAIL = 'gmail-api-push@system.gserviceaccount.com';

interface GmailNodeConfig {
  topicName?: unknown;
  labelIds?: unknown;
  labelFilterAction?: unknown;
}

interface GmailErrorLike {
  code?: number | string;
}

@Injectable()
export class GmailMessageReceivedTrigger extends BasePushTrigger {
  readonly type = GMAIL_MESSAGE_RECEIVED_TYPE;
  readonly name = 'Gmail: Message Received';
  readonly description =
    'Triggers when Gmail delivers a Pub/Sub notification for a new message ' +
    "(push, OIDC-verified). Requires a Cloud Pub/Sub topic on the user's GCP project.";

  private readonly log = new Logger(GmailMessageReceivedTrigger.name);

  constructor(private readonly google: GoogleClientFactory) {
    super();
  }

  /**
   * Synchronous pre-check that returns false fast on missing/malformed
   * Authorization headers. Full OIDC verification is async — callers should
   * `await Promise.resolve(trigger.verifySignature(...))` since this method
   * may also return a Promise. The dispatcher in ProviderWebhooksService
   * already awaits, so this is safe.
   */
  verifySignature(input: SignatureInput): boolean | Promise<boolean> {
    const token = this.extractBearerToken(input.headers);
    if (!token) return false;
    if (!this.looksLikeJwt(token)) return false;
    return this.verifyOidcAsync(input);
  }

  async verifyOidcAsync(input: SignatureInput): Promise<boolean> {
    const token = this.extractBearerToken(input.headers);
    if (!token || !this.looksLikeJwt(token)) return false;

    const audience = this.audienceFromSecret(input.signingSecret);
    if (!audience) return false;

    try {
      const payload = await this.google.verifyOidcToken(token, audience);
      if (payload.email !== PUSH_SERVICE_EMAIL) return false;
      if (payload.email_verified !== true) return false;
      return true;
    } catch (err) {
      this.log.warn(
        { error: (err as Error).message },
        'OIDC verification failed for Gmail Pub/Sub push',
      );
      return false;
    }
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const cfg = (ctx.config ?? {}) as GmailNodeConfig;
    const topicName = cfg.topicName;
    if (typeof topicName !== 'string' || topicName.length === 0) {
      throw new Error('gmail-message-received requires config.topicName');
    }

    const labelIds = Array.isArray(cfg.labelIds)
      ? cfg.labelIds.filter((s): s is string => typeof s === 'string')
      : undefined;
    const filterAction =
      cfg.labelFilterAction === 'include'
        ? 'INCLUDE'
        : cfg.labelFilterAction === 'exclude'
          ? 'EXCLUDE'
          : undefined;

    const requestBody: Record<string, unknown> = { topicName };
    if (labelIds && labelIds.length > 0) requestBody.labelIds = labelIds;
    if (filterAction) requestBody.labelFilterAction = filterAction;

    const client = this.google.gmail(ctx.connection);
    const response = await client.users.watch({ userId: 'me', requestBody });

    const data = response.data as { historyId?: string | null; expiration?: string | null };
    if (!data.historyId) {
      throw new Error('Gmail watch did not return a historyId');
    }

    // Encode the callback URL into the signing secret so verifyOidcAsync can
    // recover the audience without needing additional persisted state.
    const signingSecret = `${ctx.callbackUrl}::oidc`;
    const expiresAt = data.expiration ? new Date(Number(data.expiration)) : undefined;

    return {
      providerSubId: data.historyId,
      signingSecret,
      ...(expiresAt ? { expiresAt } : {}),
    };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    const client = this.google.gmail(ctx.connection);
    try {
      await client.users.stop({ userId: 'me' });
    } catch (err) {
      const code = (err as GmailErrorLike).code;
      if (code === 404 || code === '404') {
        this.log.warn(
          { workflowId: ctx.workflowId, providerSubId: ctx.providerSubId },
          'Gmail watch already stopped, skipping',
        );
        return;
      }
      throw err;
    }
  }

  private extractBearerToken(
    headers: Record<string, string | string[] | undefined>,
  ): string | null {
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== 'authorization') continue;
      const value = typeof v === 'string' ? v : Array.isArray(v) ? v[0] : null;
      if (typeof value !== 'string') continue;
      if (!value.startsWith('Bearer ')) continue;
      return value.slice(7).trim();
    }
    return null;
  }

  private looksLikeJwt(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every((p) => p.length > 0);
  }

  private audienceFromSecret(signingSecret: string): string | null {
    const sep = signingSecret.indexOf('::oidc');
    if (sep === -1) return null;
    return signingSecret.slice(0, sep);
  }
}
