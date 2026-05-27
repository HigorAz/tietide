import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { outlookUpdateMessageConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';

export const OUTLOOK_UPDATE_MESSAGE_TYPE = 'outlook-update-message';

@Injectable()
export class OutlookUpdateMessageAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = OUTLOOK_UPDATE_MESSAGE_TYPE;
  readonly name = 'Outlook: Update Message';
  readonly description = 'Flag, categorize, mark read/unread, or move an Outlook message';
  readonly requiredConnectionType = 'microsoft';

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = outlookUpdateMessageConfigSchema.parse(input.params);

    const applied: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};
    if (params.flagStatus !== undefined) {
      patch.flag = { flagStatus: params.flagStatus };
      applied.flag = params.flagStatus;
    }
    if (params.categories && params.categories.length > 0) {
      patch.categories = params.categories;
      applied.categories = params.categories;
    }
    if (params.markRead === true) {
      patch.isRead = true;
      applied.isRead = true;
    } else if (params.markUnread === true) {
      patch.isRead = false;
      applied.isRead = false;
    }
    if (params.moveToFolderId !== undefined) {
      applied.movedTo = params.moveToFolderId;
    }

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, messageId: params.messageId, wouldHaveApplied: applied },
        metadata: { mocked: true },
      };
    }

    const basePath = `/v1.0/me/messages/${encodeURIComponent(params.messageId)}`;
    let messageId = params.messageId;
    let lastStatus = 200;

    // PATCH the in-place fields (flag/categories/read) first; the message keeps
    // its id. The move is applied last because it relocates the message and
    // Graph returns a NEW id in the destination folder.
    if (Object.keys(patch).length > 0) {
      const res = await this.authService.graphFetch(connection, basePath, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      lastStatus = res.status;
    }

    if (params.moveToFolderId !== undefined) {
      const res = await this.authService.graphFetch<{ id?: string }>(
        connection,
        `${basePath}/move`,
        { method: 'POST', body: JSON.stringify({ destinationId: params.moveToFolderId }) },
      );
      lastStatus = res.status;
      if (res.data?.id) messageId = res.data.id;
    }

    return { data: { messageId, applied }, metadata: { statusCode: lastStatus } };
  }
}
