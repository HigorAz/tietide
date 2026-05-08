import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { gmailSendConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const GMAIL_SEND_TYPE = 'gmail-send';

@Injectable()
export class GmailSendAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = GMAIL_SEND_TYPE;
  readonly name = 'Gmail: Send Email';
  readonly description = 'Send an email via Gmail';
  readonly requiredConnectionType = 'google';

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
    const params = gmailSendConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSent: {
            to: params.to,
            cc: params.cc,
            bcc: params.bcc,
            subject: params.subject,
            attachmentCount: params.attachments?.length ?? 0,
          },
        },
        metadata: { mocked: true },
      };
    }

    const auth = this.authService.buildClient(connection);
    const client = this.clients.gmail({ auth });

    const raw = encodeRfc822({
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      body: params.body,
      attachments: params.attachments,
    });

    const response = await client.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    return {
      data: {
        messageId: response.data.id ?? null,
        threadId: response.data.threadId ?? null,
        labelIds: response.data.labelIds ?? [],
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}

interface RfcAttachment {
  filename: string;
  contentBase64: string;
  mimeType: string;
}

interface EncodeArgs {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  attachments?: RfcAttachment[];
}

const CRLF = '\r\n';

const base64UrlEncode = (input: string): string =>
  Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const generateBoundary = (): string =>
  `tietide_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;

export const encodeRfc822 = (args: EncodeArgs): string => {
  const headers: string[] = [`To: ${args.to}`];
  if (args.cc) headers.push(`Cc: ${args.cc}`);
  if (args.bcc) headers.push(`Bcc: ${args.bcc}`);
  headers.push(`Subject: ${args.subject}`);
  headers.push('MIME-Version: 1.0');

  const hasAttachments = (args.attachments?.length ?? 0) > 0;

  let message: string;
  if (!hasAttachments) {
    headers.push('Content-Type: text/plain; charset=UTF-8');
    headers.push('Content-Transfer-Encoding: 7bit');
    message = headers.join(CRLF) + CRLF + CRLF + args.body;
  } else {
    const boundary = generateBoundary();
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

    const parts: string[] = [];
    parts.push(`--${boundary}`);
    parts.push('Content-Type: text/plain; charset=UTF-8');
    parts.push('Content-Transfer-Encoding: 7bit');
    parts.push('');
    parts.push(args.body);

    for (const att of args.attachments!) {
      parts.push(`--${boundary}`);
      parts.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
      parts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
      parts.push('Content-Transfer-Encoding: base64');
      parts.push('');
      parts.push(att.contentBase64);
    }

    parts.push(`--${boundary}--`);
    message = headers.join(CRLF) + CRLF + CRLF + parts.join(CRLF);
  }

  return base64UrlEncode(message);
};
