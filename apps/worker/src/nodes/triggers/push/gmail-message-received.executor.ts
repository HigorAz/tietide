import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';
import { ConnectorMisconfiguredError } from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';
import {
  GOOGLE_CLIENTS,
  GoogleAuthService,
  type GoogleClientFactories,
} from '../../connectors/google/google-auth';
import { isGoogleAuthError, wrapGoogleAuthError } from '../../connectors/google/google-error';

export const GMAIL_MESSAGE_RECEIVED_TYPE = 'gmail-message-received';

interface PubSubEnvelope {
  message?: { data?: string };
}

interface DecodedNotification {
  emailAddress?: string;
  historyId?: string;
}

interface HistoryRecord {
  id?: string | null;
  messagesAdded?: Array<{
    message?: { id?: string | null; threadId?: string | null };
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
export class GmailMessageReceivedExecutor implements INodeExecutor {
  readonly type = GMAIL_MESSAGE_RECEIVED_TYPE;
  readonly name = 'Gmail: Message Received';
  readonly description =
    'Trigger executor that expands a Gmail Pub/Sub historyId notification into the actual new messages';
  readonly category = 'trigger' as const;

  private readonly log = new Logger(GmailMessageReceivedExecutor.name);

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {}

  async execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput> {
    const connectionId = input.connectionId;
    if (typeof connectionId !== 'string' || connectionId.length === 0) {
      throw new ConnectorMisconfiguredError(
        `Node "${this.type}" requires input.connectionId`,
        this.type,
      );
    }

    const decoded = this.decodePubSubPayload(input.data);
    const historyId = decoded.historyId;
    if (typeof historyId !== 'string' || historyId.length === 0) {
      throw new Error('gmail-message-received: input.data.message.data missing or malformed');
    }

    const connection = await context.getConnection<GoogleOAuth2Config>(connectionId);

    const gmail = this.clients.gmail({
      auth: this.authService.buildClient(connection),
    });

    let response;
    try {
      response = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: historyId,
        historyTypes: ['messageAdded'],
      });
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404) {
        // historyId can age out after ~7 days; we do not retry — surface as
        // empty + flag and let the user reactivate the workflow if needed.
        this.log.warn(
          { historyId, connectionId },
          'gmail-message-received: history.list returned 404 (historyId expired)',
        );
        return {
          data: { historyId, messages: [] },
          metadata: { historyExpired: true },
        };
      }
      if (isGoogleAuthError(err)) {
        await context.markConnectionForRefresh(connectionId);
        throw wrapGoogleAuthError(err, { connectionId, provider: connection.provider });
      }
      throw err;
    }

    const records = (response.data.history ?? []) as HistoryRecord[];
    const newMessageIds: string[] = [];
    for (const r of records) {
      for (const added of r.messagesAdded ?? []) {
        const id = added.message?.id;
        if (typeof id === 'string' && id.length > 0) newMessageIds.push(id);
      }
    }

    const messages: Array<Record<string, unknown>> = [];
    for (const id of newMessageIds) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
        });
        const msg = detail.data as MessageMetadata;
        const headerMap: Record<string, string> = {};
        for (const h of msg.payload?.headers ?? []) {
          if (typeof h?.name === 'string' && typeof h?.value === 'string') {
            headerMap[h.name] = h.value;
          }
        }
        messages.push({
          id: msg.id,
          threadId: msg.threadId,
          labelIds: msg.labelIds,
          snippet: msg.snippet,
          from: headerMap['From'],
          subject: headerMap['Subject'],
          headers: headerMap,
        });
      } catch (err) {
        if (isGoogleAuthError(err)) {
          await context.markConnectionForRefresh(connectionId);
          throw wrapGoogleAuthError(err, { connectionId, provider: connection.provider });
        }
        throw err;
      }
    }

    return {
      data: { historyId, messages },
    };
  }

  private decodePubSubPayload(data: unknown): DecodedNotification {
    if (!data || typeof data !== 'object') return {};
    const env = data as PubSubEnvelope;
    const b64 = env.message?.data;
    if (typeof b64 !== 'string' || b64.length === 0) return {};
    try {
      const json = Buffer.from(b64, 'base64').toString('utf8');
      const parsed = JSON.parse(json) as DecodedNotification;
      return parsed;
    } catch {
      return {};
    }
  }
}
