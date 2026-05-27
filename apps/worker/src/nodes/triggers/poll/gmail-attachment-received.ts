import { Inject, Injectable } from '@nestjs/common';
import { BasePollTrigger, type PollContext, type PollResult } from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';
import {
  GOOGLE_CLIENTS,
  GoogleAuthService,
  type GoogleClientFactories,
} from '../../connectors/google/google-auth';
import { isGoogleAuthError, wrapGoogleAuthError } from '../../connectors/google/google-error';

export const GMAIL_ATTACHMENT_RECEIVED_TYPE = 'gmail-attachment-received';

interface HistoryRecord {
  messagesAdded?: Array<{ message?: { id?: string | null; threadId?: string | null } }>;
}

interface MessagePart {
  mimeType?: string | null;
  filename?: string | null;
  body?: { attachmentId?: string | null; size?: number | null };
  parts?: MessagePart[];
}

interface MessageDetail {
  id?: string | null;
  threadId?: string | null;
  labelIds?: string[] | null;
  snippet?: string | null;
  payload?: {
    headers?: Array<{ name?: string | null; value?: string | null }>;
    parts?: MessagePart[];
  } & MessagePart;
}

interface Attachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class GmailAttachmentReceivedTrigger extends BasePollTrigger {
  readonly type = GMAIL_ATTACHMENT_RECEIVED_TYPE;
  readonly name = 'Gmail: Attachment Received';
  readonly description =
    'Fires once per new Gmail message that carries an attachment (cursor = historyId)';
  readonly defaultIntervalSeconds = 60;

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
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
        throw new Error('gmail-attachment-received: getProfile returned no historyId');
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
    const messageIds = new Set<string>();
    for (const record of history) {
      for (const added of record.messagesAdded ?? []) {
        const id = added.message?.id;
        if (typeof id === 'string' && id.length > 0) messageIds.add(id);
      }
    }

    const items: Record<string, unknown>[] = [];
    for (const messageId of messageIds) {
      const detail = await this.callOrWrap(
        () => gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' }),
        conn,
      );
      const msg = detail.data as MessageDetail;
      const attachments = collectAttachments(msg.payload);
      if (attachments.length === 0) continue;

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
        attachments,
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

function collectAttachments(part: MessagePart | undefined): Attachment[] {
  if (!part) return [];
  const found: Attachment[] = [];
  const walk = (node: MessagePart): void => {
    const attachmentId = node.body?.attachmentId;
    if (typeof node.filename === 'string' && node.filename.length > 0 && attachmentId) {
      found.push({
        attachmentId,
        filename: node.filename,
        mimeType: node.mimeType ?? 'application/octet-stream',
        size: node.body?.size ?? 0,
      });
    }
    for (const child of node.parts ?? []) walk(child);
  };
  walk(part);
  return found;
}
