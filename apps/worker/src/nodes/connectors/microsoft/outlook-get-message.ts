import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { outlookGetMessageConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';

export const OUTLOOK_GET_MESSAGE_TYPE = 'outlook-get-message';

interface GraphEmailAddress {
  name?: string | null;
  address?: string | null;
}

interface GraphRecipient {
  emailAddress?: GraphEmailAddress | null;
}

interface GraphAttachment {
  id?: string | null;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  isInline?: boolean | null;
}

interface GraphMessage {
  id?: string | null;
  subject?: string | null;
  from?: GraphRecipient | null;
  toRecipients?: GraphRecipient[] | null;
  ccRecipients?: GraphRecipient[] | null;
  receivedDateTime?: string | null;
  bodyPreview?: string | null;
  body?: { contentType?: string | null; content?: string | null } | null;
  hasAttachments?: boolean | null;
  attachments?: GraphAttachment[] | null;
}

const addressOf = (r: GraphRecipient | null | undefined): string | null =>
  r?.emailAddress?.address ?? null;

const addressList = (rs: GraphRecipient[] | null | undefined): string[] =>
  (rs ?? []).map(addressOf).filter((a): a is string => a !== null);

@Injectable()
export class OutlookGetMessageAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = OUTLOOK_GET_MESSAGE_TYPE;
  readonly name = 'Outlook: Get Message';
  readonly description = 'Fetch a full Outlook message by ID (headers, body, attachment list)';
  readonly requiredConnectionType = 'microsoft';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = outlookGetMessageConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveFetched: { messageId: params.messageId } },
        metadata: { mocked: true },
      };
    }

    // Expand attachment metadata only (id/name/contentType/size) — the bytes are
    // fetched on demand by outlook-get-attachment to keep this payload small.
    const expand = encodeURIComponent('attachments($select=id,name,contentType,size,isInline)');
    const path = `/v1.0/me/messages/${encodeURIComponent(params.messageId)}?%24expand=${expand}`;

    const response = await this.authService.graphFetch<GraphMessage>(connection, path);
    const msg = response.data ?? {};

    return {
      data: {
        messageId: msg.id ?? params.messageId,
        subject: msg.subject ?? null,
        from: addressOf(msg.from),
        to: addressList(msg.toRecipients),
        cc: addressList(msg.ccRecipients),
        receivedDateTime: msg.receivedDateTime ?? null,
        bodyPreview: msg.bodyPreview ?? null,
        body: {
          contentType: msg.body?.contentType ?? null,
          content: msg.body?.content ?? null,
        },
        hasAttachments: msg.hasAttachments ?? false,
        attachments: (msg.attachments ?? []).map((a) => ({
          id: a.id ?? null,
          name: a.name ?? null,
          contentType: a.contentType ?? null,
          size: a.size ?? 0,
          isInline: a.isInline ?? false,
        })),
      },
      metadata: { statusCode: response.status },
    };
  }
}
