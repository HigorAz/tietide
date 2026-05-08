import { Inject, Injectable } from '@nestjs/common';
import { BasePollTrigger, type PollContext, type PollResult } from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';
import {
  GOOGLE_CLIENTS,
  GoogleAuthService,
  type GoogleClientFactories,
} from '../../connectors/google/google-auth';
import { isGoogleAuthError, wrapGoogleAuthError } from '../../connectors/google/google-error';

export const GMAIL_LABEL_ADDED_TYPE = 'gmail-label-added';

interface GmailLabelAddedConfig {
  labelId?: unknown;
}

interface HistoryRecord {
  id?: string | null;
  labelsAdded?: Array<{
    message?: { id?: string | null; threadId?: string | null };
    labelIds?: string[] | null;
  }>;
}

interface MessageMetadata {
  id?: string | null;
  threadId?: string | null;
  labelIds?: string[] | null;
  snippet?: string | null;
  payload?: { headers?: Array<{ name?: string | null; value?: string | null }> };
}

@Injectable()
export class GmailLabelAddedTrigger extends BasePollTrigger {
  readonly type = GMAIL_LABEL_ADDED_TYPE;
  readonly name = 'Gmail: Label Added';
  readonly description =
    'Fires once per Gmail message that gains the configured label (cursor = historyId)';
  readonly defaultIntervalSeconds = 60;

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const cfg = ctx.config as unknown as GmailLabelAddedConfig;
    const labelId = cfg.labelId;
    if (typeof labelId !== 'string' || labelId.length === 0) {
      throw new Error('gmail-label-added requires config.labelId');
    }

    const conn = ctx.connection as unknown as {
      id: string;
      type: string;
      provider: string;
      config: GoogleOAuth2Config;
      refreshToken?: string;
    };

    const gmail = this.clients.gmail({
      auth: this.authService.buildClient(conn),
    });

    if (ctx.cursor === null) {
      const profile = await this.callOrWrap(() => gmail.users.getProfile({ userId: 'me' }), conn);
      const historyId = profile.data.historyId;
      if (typeof historyId !== 'string' || historyId.length === 0) {
        throw new Error('gmail-label-added: getProfile returned no historyId');
      }
      return { items: [], newCursor: historyId };
    }

    const response = await this.callOrWrap(
      () =>
        gmail.users.history.list({
          userId: 'me',
          startHistoryId: ctx.cursor as string,
          historyTypes: ['labelAdded'],
          labelId,
        }),
      conn,
    );

    const history = (response.data.history ?? []) as HistoryRecord[];
    const matchedMessageIds: string[] = [];
    for (const record of history) {
      for (const added of record.labelsAdded ?? []) {
        if (!added.labelIds || !added.labelIds.includes(labelId)) continue;
        const messageId = added.message?.id;
        if (typeof messageId !== 'string' || messageId.length === 0) continue;
        matchedMessageIds.push(messageId);
      }
    }

    const items: Record<string, unknown>[] = [];
    for (const messageId of matchedMessageIds) {
      const detail = await this.callOrWrap(
        () =>
          gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'metadata',
          }),
        conn,
      );
      const msg = detail.data as MessageMetadata;
      const headers: Record<string, string> = {};
      for (const h of msg.payload?.headers ?? []) {
        if (typeof h?.name === 'string' && typeof h?.value === 'string') {
          headers[h.name] = h.value;
        }
      }
      items.push({
        id: msg.id,
        threadId: msg.threadId,
        labelIds: msg.labelIds,
        snippet: msg.snippet,
        headers,
      });
    }

    const newCursor =
      typeof response.data.historyId === 'string' && response.data.historyId.length > 0
        ? response.data.historyId
        : (ctx.cursor as string);

    return { items, newCursor };
  }

  private async callOrWrap<T>(
    fn: () => Promise<T>,
    conn: { id: string; provider: string },
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isGoogleAuthError(err)) {
        throw wrapGoogleAuthError(err, { connectionId: conn.id, provider: conn.provider });
      }
      throw err;
    }
  }
}
