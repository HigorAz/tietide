import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { outlookSendConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';

export const OUTLOOK_SEND_TYPE = 'outlook-send';

interface Recipient {
  emailAddress: { address: string };
}

const splitRecipients = (raw: string | undefined): Recipient[] => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((address) => ({ emailAddress: { address } }));
};

@Injectable()
export class OutlookSendAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = OUTLOOK_SEND_TYPE;
  readonly name = 'Outlook: Send Email';
  readonly description = 'Send an email via Outlook (Microsoft 365)';
  readonly requiredConnectionType = 'microsoft';

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = outlookSendConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSent: {
            to: params.to,
            cc: params.cc ?? null,
            bcc: params.bcc ?? null,
            subject: params.subject,
            attachmentCount: params.attachments?.length ?? 0,
          },
        },
        metadata: { mocked: true },
      };
    }

    const message: Record<string, unknown> = {
      subject: params.subject,
      body: {
        contentType: params.isHtml ? 'HTML' : 'Text',
        content: params.body,
      },
      toRecipients: splitRecipients(params.to),
    };

    const cc = splitRecipients(params.cc);
    if (cc.length > 0) message.ccRecipients = cc;

    const bcc = splitRecipients(params.bcc);
    if (bcc.length > 0) message.bccRecipients = bcc;

    if (params.attachments && params.attachments.length > 0) {
      message.attachments = params.attachments.map((att) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.mimeType,
        contentBytes: att.contentBase64,
      }));
    }

    const response = await this.authService.graphFetch(connection, '/v1.0/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    return {
      data: {
        sent: true,
        sentAt: new Date().toISOString(),
      },
      metadata: { statusCode: response.status },
    };
  }
}
