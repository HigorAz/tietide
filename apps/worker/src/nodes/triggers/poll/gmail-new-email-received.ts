import { Inject, Injectable } from '@nestjs/common';
import { BasePollTrigger, type PollContext, type PollResult } from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';
import {
  GOOGLE_CLIENTS,
  GoogleAuthService,
  type GoogleClientFactories,
} from '../../connectors/google/google-auth';
import { isGoogleAuthError, wrapGoogleAuthError } from '../../connectors/google/google-error';

export const GMAIL_NEW_EMAIL_RECEIVED_TYPE = 'gmail-new-email-received';

interface GmailNewEmailReceivedConfig {
  query?: unknown;
}

interface HistoryRecord {
  id?: string | null;
  messagesAdded?: Array<{
    message?: { id?: string | null; threadId?: string | null; labelIds?: string[] | null };
  }>;
}

interface MessageMetadata {
  id?: string | null;
  threadId?: string | null;
  labelIds?: string[] | null;
  snippet?: string | null;
  payload?: { headers?: Array<{ name?: string | null; value?: string | null }> };
}

/**
 * Poll-based "new email" trigger — the beginner-friendly counterpart to the
 * push-only gmail-message-received (which needs a Google Cloud Pub/Sub topic).
 * It only needs a Google connection: the cursor is the Gmail `historyId`, and
 * each poll fires once per message that was ADDED to the mailbox since the last
 * tick. An optional Gmail `query` (e.g. `from:boss@x.com is:unread`) narrows
 * which new messages fire the workflow.
 */
@Injectable()
export class GmailNewEmailReceivedTrigger extends BasePollTrigger {
  readonly type = GMAIL_NEW_EMAIL_RECEIVED_TYPE;
  readonly name = 'Gmail: New Email Received';
  readonly description =
    'Fires once per new Gmail message since the last poll (cursor = historyId; no Pub/Sub)';
  readonly defaultIntervalSeconds = 60;

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const cfg = ctx.config as unknown as GmailNewEmailReceivedConfig;
    const query = typeof cfg.query === 'string' && cfg.query.length > 0 ? cfg.query : undefined;

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

    // First tick seeds the cursor — never replay the whole mailbox on activation.
    if (ctx.cursor === null) {
      const profile = await this.callOrWrap(() => gmail.users.getProfile({ userId: 'me' }), conn);
      const historyId = profile.data.historyId;
      if (typeof historyId !== 'string' || historyId.length === 0) {
        throw new Error('gmail-new-email-received: getProfile returned no historyId');
      }
      return { items: [], newCursor: historyId };
    }

    const response = await this.callOrWrap(
      () =>
        gmail.users.history.list({
          userId: 'me',
          startHistoryId: ctx.cursor as string,
          historyTypes: ['messageAdded'],
        }),
      conn,
    );

    const history = (response.data.history ?? []) as HistoryRecord[];
    const messageIds: string[] = [];
    for (const record of history) {
      for (const added of record.messagesAdded ?? []) {
        const messageId = added.message?.id;
        if (typeof messageId !== 'string' || messageId.length === 0) continue;
        if (!messageIds.includes(messageId)) messageIds.push(messageId);
      }
    }

    // Honor an optional Gmail search query by intersecting the newly-added
    // messages with the set matching the query (best-effort, most-recent page).
    let candidateIds = messageIds;
    if (query && messageIds.length > 0) {
      const list = await this.callOrWrap(
        () => gmail.users.messages.list({ userId: 'me', q: query }),
        conn,
      );
      const matched = new Set(
        (list.data.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => typeof id === 'string'),
      );
      candidateIds = messageIds.filter((id) => matched.has(id));
    }

    const items: Record<string, unknown>[] = [];
    for (const messageId of candidateIds) {
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
