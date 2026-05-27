import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { gmailGetAttachmentConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const GMAIL_GET_ATTACHMENT_TYPE = 'gmail-get-attachment';

// Gmail returns attachment bytes as base64url. Re-encode to standard base64 so
// downstream upload nodes (Drive/S3/gmail-send) can consume it directly.
const toStandardBase64 = (base64Url: string): string =>
  Buffer.from(base64Url.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('base64');

@Injectable()
export class GmailGetAttachmentAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = GMAIL_GET_ATTACHMENT_TYPE;
  readonly name = 'Gmail: Get Attachment';
  readonly description = 'Download a Gmail attachment by message ID and attachment ID (base64)';
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
    const params = gmailGetAttachmentConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveFetched: { messageId: params.messageId, attachmentId: params.attachmentId },
        },
        metadata: { mocked: true },
      };
    }

    const gmail = this.clients.gmail({ auth: this.authService.buildClient(connection) });
    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: params.messageId,
      id: params.attachmentId,
    });

    const rawData = response.data?.data ?? '';

    return {
      data: {
        dataBase64: rawData ? toStandardBase64(rawData) : '',
        size: response.data?.size ?? 0,
        filename: params.filename ?? null,
        mimeType: params.mimeType ?? null,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
