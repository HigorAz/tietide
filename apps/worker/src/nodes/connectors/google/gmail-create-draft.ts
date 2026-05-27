import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { gmailCreateDraftConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';
import { encodeRfc822 } from './gmail-send';

export const GMAIL_CREATE_DRAFT_TYPE = 'gmail-create-draft';

interface DraftResponse {
  id?: string | null;
  message?: { id?: string | null; threadId?: string | null };
}

@Injectable()
export class GmailCreateDraftAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = GMAIL_CREATE_DRAFT_TYPE;
  readonly name = 'Gmail: Create Draft';
  readonly description = 'Create a Gmail draft (optionally a reply within a thread)';
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
    const params = gmailCreateDraftConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: { to: params.to, subject: params.subject, threadId: params.threadId },
        },
        metadata: { mocked: true },
      };
    }

    const gmail = this.clients.gmail({ auth: this.authService.buildClient(connection) });

    const raw = encodeRfc822({
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      body: params.body,
    });

    const message: { raw: string; threadId?: string } = { raw };
    if (params.threadId) message.threadId = params.threadId;

    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message },
    });

    const data = (response.data ?? {}) as DraftResponse;

    return {
      data: {
        draftId: data.id ?? null,
        messageId: data.message?.id ?? null,
        threadId: data.message?.threadId ?? null,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
