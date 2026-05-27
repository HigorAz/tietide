import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { gmailModifyLabelsConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const GMAIL_MODIFY_LABELS_TYPE = 'gmail-modify-labels';

@Injectable()
export class GmailModifyLabelsAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = GMAIL_MODIFY_LABELS_TYPE;
  readonly name = 'Gmail: Modify Labels';
  readonly description = 'Add/remove labels, archive, or mark a Gmail message read/unread';
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
    const params = gmailModifyLabelsConfigSchema.parse(input.params);

    // Fold the convenience flags into the explicit label deltas, de-duping.
    const add = new Set(params.addLabelIds ?? []);
    const remove = new Set(params.removeLabelIds ?? []);
    if (params.archive) remove.add('INBOX');
    if (params.markRead) remove.add('UNREAD');
    if (params.markUnread) add.add('UNREAD');
    const addLabelIds = [...add];
    const removeLabelIds = [...remove];

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveModified: { messageId: params.messageId, addLabelIds, removeLabelIds },
        },
        metadata: { mocked: true },
      };
    }

    const gmail = this.clients.gmail({ auth: this.authService.buildClient(connection) });
    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: params.messageId,
      requestBody: { addLabelIds, removeLabelIds },
    });

    return {
      data: {
        messageId: response.data.id ?? params.messageId,
        labelIds: response.data.labelIds ?? [],
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
