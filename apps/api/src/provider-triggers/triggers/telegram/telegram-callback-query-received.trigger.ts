import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
} from '@tietide/sdk';
import { TelegramApiError, TelegramApiFactory } from './telegram-client.factory';

export const TELEGRAM_CALLBACK_QUERY_RECEIVED_TYPE = 'telegram-callback-query-received';

interface TelegramBotTokenConfig {
  botToken: string;
}

@Injectable()
export class TelegramCallbackQueryReceivedTrigger extends BasePushTrigger {
  readonly type = TELEGRAM_CALLBACK_QUERY_RECEIVED_TYPE;
  readonly name = 'Telegram: Callback Query Received';
  readonly description = 'Triggers when a Telegram inline-keyboard button is pressed';

  private readonly log = new Logger(TelegramCallbackQueryReceivedTrigger.name);

  constructor(private readonly telegram: TelegramApiFactory) {
    super();
  }

  // Telegram echoes our `secret_token` in the X-Telegram-Bot-Api-Secret-Token
  // header on every webhook request; constant-time compare.
  verifySignature(input: SignatureInput): boolean {
    const provided = this.extractHeader(input.headers, 'x-telegram-bot-api-secret-token');
    if (!provided) return false;
    const expected = Buffer.from(input.signingSecret, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');
    if (providedBuf.length !== expected.length) return false;
    return timingSafeEqual(providedBuf, expected);
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const conn = ctx.connection.config as unknown as TelegramBotTokenConfig;
    const secretToken = randomBytes(32).toString('base64url');

    const response = await this.telegram.call<{
      ok?: boolean;
      result?: boolean;
      description?: string;
    }>(conn.botToken, 'setWebhook', {
      url: ctx.callbackUrl,
      secret_token: secretToken,
      allowed_updates: ['callback_query'],
    });

    if (response.data?.ok !== true) {
      throw new Error(
        `Telegram setWebhook failed: ${response.data?.description ?? 'unknown error'}`,
      );
    }

    return {
      providerSubId: `telegram-${Date.now().toString(36)}`,
      signingSecret: secretToken,
    };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    const conn = ctx.connection.config as unknown as TelegramBotTokenConfig;
    try {
      await this.telegram.call(conn.botToken, 'deleteWebhook', {});
    } catch (err) {
      if (err instanceof TelegramApiError) {
        this.log.warn(
          { workflowId: ctx.workflowId, status: err.response.status },
          'Telegram deleteWebhook failed; continuing with deactivation',
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
}
