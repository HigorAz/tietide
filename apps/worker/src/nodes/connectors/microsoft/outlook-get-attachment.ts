import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { outlookGetAttachmentConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';

export const OUTLOOK_GET_ATTACHMENT_TYPE = 'outlook-get-attachment';

interface GraphAttachment {
  '@odata.type'?: string | null;
  id?: string | null;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  isInline?: boolean | null;
  // Present only on #microsoft.graph.fileAttachment — base64 of the raw bytes.
  contentBytes?: string | null;
}

@Injectable()
export class OutlookGetAttachmentAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = OUTLOOK_GET_ATTACHMENT_TYPE;
  readonly name = 'Outlook: Get Attachment';
  readonly description = 'Download an Outlook attachment by message + attachment ID (base64)';
  readonly requiredConnectionType = 'microsoft';

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = outlookGetAttachmentConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveFetched: {
            messageId: params.messageId,
            attachmentId: params.attachmentId,
          },
        },
        metadata: { mocked: true },
      };
    }

    const path =
      `/v1.0/me/messages/${encodeURIComponent(params.messageId)}` +
      `/attachments/${encodeURIComponent(params.attachmentId)}`;

    const response = await this.authService.graphFetch<GraphAttachment>(connection, path);
    const att = response.data ?? {};

    return {
      data: {
        id: att.id ?? params.attachmentId,
        name: att.name ?? null,
        contentType: att.contentType ?? null,
        size: att.size ?? 0,
        isInline: att.isInline ?? false,
        odataType: att['@odata.type'] ?? null,
        // Only fileAttachment carries bytes; item/reference attachments return null.
        contentBase64: att.contentBytes ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
