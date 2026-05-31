import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { gmailGetMessageConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const GMAIL_GET_MESSAGE_TYPE = 'gmail-get-message';

interface GmailHeader {
  name?: string | null;
  value?: string | null;
}

interface GmailPart {
  mimeType?: string | null;
  filename?: string | null;
  body?: { size?: number | null; data?: string | null; attachmentId?: string | null };
  parts?: GmailPart[];
}

interface GmailMessagePayload extends GmailPart {
  headers?: GmailHeader[];
}

interface GmailMessage {
  id?: string | null;
  threadId?: string | null;
  labelIds?: string[] | null;
  snippet?: string | null;
  payload?: GmailMessagePayload;
}

interface DecodedAttachment {
  filename: string;
  attachmentId: string;
  mimeType: string;
  size: number;
}

interface BodyAccumulator {
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: DecodedAttachment[];
}

const decodeBase64Url = (data: string): string =>
  Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

const findHeader = (headers: GmailHeader[], name: string): string | null => {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name?.toLowerCase() === lower)?.value ?? null;
};

// Walk the MIME tree once, collecting the first text/plain + text/html bodies
// and every attachment part (a part with both a filename and an attachmentId).
const collectParts = (part: GmailPart, acc: BodyAccumulator): void => {
  const mime = part.mimeType ?? '';
  const filename = part.filename ?? '';
  const attachmentId = part.body?.attachmentId ?? null;

  if (filename && attachmentId) {
    acc.attachments.push({ filename, attachmentId, mimeType: mime, size: part.body?.size ?? 0 });
  } else if (mime === 'text/plain' && part.body?.data && acc.bodyText === null) {
    acc.bodyText = decodeBase64Url(part.body.data);
  } else if (mime === 'text/html' && part.body?.data && acc.bodyHtml === null) {
    acc.bodyHtml = decodeBase64Url(part.body.data);
  }

  for (const child of part.parts ?? []) collectParts(child, acc);
};

@Injectable()
export class GmailGetMessageAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = GMAIL_GET_MESSAGE_TYPE;
  readonly name = 'Gmail: Get Message';
  readonly description = 'Fetch a Gmail message by ID (headers, decoded body, attachment list)';
  readonly requiredConnectionType = 'google';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GoogleOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = gmailGetMessageConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveFetched: { messageId: params.messageId } },
        metadata: { mocked: true },
      };
    }

    const gmail = this.clients.gmail({ auth: this.authService.buildClient(connection) });
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: params.messageId,
      format: 'full',
    });

    const message = (response.data ?? {}) as GmailMessage;
    const payload = message.payload ?? {};
    const headers = payload.headers ?? [];

    const acc: BodyAccumulator = { bodyText: null, bodyHtml: null, attachments: [] };
    collectParts(payload, acc);

    return {
      data: {
        messageId: message.id ?? params.messageId,
        threadId: message.threadId ?? null,
        subject: findHeader(headers, 'Subject'),
        from: findHeader(headers, 'From'),
        to: findHeader(headers, 'To'),
        cc: findHeader(headers, 'Cc'),
        date: findHeader(headers, 'Date'),
        snippet: message.snippet ?? null,
        bodyText: acc.bodyText,
        bodyHtml: acc.bodyHtml,
        labelIds: message.labelIds ?? [],
        attachments: acc.attachments,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
