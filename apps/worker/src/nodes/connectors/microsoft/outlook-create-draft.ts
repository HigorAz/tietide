import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { outlookCreateDraftConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';

export const OUTLOOK_CREATE_DRAFT_TYPE = 'outlook-create-draft';

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

interface DraftResponse {
  id?: string | null;
  webLink?: string | null;
}

@Injectable()
export class OutlookCreateDraftAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = OUTLOOK_CREATE_DRAFT_TYPE;
  readonly name = 'Outlook: Create Draft';
  readonly description = 'Create a draft email, or a reply draft to an existing message';
  readonly requiredConnectionType = 'microsoft';

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = outlookCreateDraftConfigSchema.parse(input.params);
    const isReply = params.replyToMessageId !== undefined;

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: { isReply, to: params.to ?? null, subject: params.subject ?? null },
        },
        metadata: { mocked: true },
      };
    }

    let response;
    if (isReply) {
      // createReply returns a fully-formed draft reply; the body text is passed
      // as the comment, which Graph inserts above the quoted original.
      const path = `/v1.0/me/messages/${encodeURIComponent(params.replyToMessageId as string)}/createReply`;
      response = await this.authService.graphFetch<DraftResponse>(connection, path, {
        method: 'POST',
        body: JSON.stringify({ comment: params.body }),
      });
    } else {
      const message: Record<string, unknown> = {
        subject: params.subject,
        body: { contentType: params.isHtml ? 'HTML' : 'Text', content: params.body },
        toRecipients: splitRecipients(params.to),
      };
      const cc = splitRecipients(params.cc);
      if (cc.length > 0) message.ccRecipients = cc;

      response = await this.authService.graphFetch<DraftResponse>(connection, '/v1.0/me/messages', {
        method: 'POST',
        body: JSON.stringify(message),
      });
    }

    const data = response.data ?? {};
    return {
      data: {
        draftId: data.id ?? null,
        webLink: data.webLink ?? null,
        isReply,
      },
      metadata: { statusCode: response.status },
    };
  }
}
