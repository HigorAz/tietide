import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { slackInviteToChannelConfigSchema, type SlackOAuth2Config } from '@tietide/shared';
import { SlackClientFactory } from './slack-client.factory';

export const SLACK_INVITE_TO_CHANNEL_TYPE = 'slack-invite-to-channel';

interface SlackInviteResponse {
  ok?: boolean;
  channel?: { id?: string; name?: string };
}

@Injectable()
export class SlackInviteToChannelAction extends BaseConnectorAction<SlackOAuth2Config> {
  readonly type = SLACK_INVITE_TO_CHANNEL_TYPE;
  readonly name = 'Slack: Invite to Channel';
  readonly description = 'Invite one or more users to a Slack channel';
  readonly requiredConnectionType = 'slack';

  constructor(private readonly client: SlackClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<SlackOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = slackInviteToChannelConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveInvited: { channel: params.channel, users: params.users } },
        metadata: { mocked: true },
      };
    }

    // Slack's conversations.invite expects `users` as a comma-separated string.
    const response = await this.client.call<SlackInviteResponse>(
      connection,
      '/conversations.invite',
      {
        method: 'POST',
        body: JSON.stringify({ channel: params.channel, users: params.users.join(',') }),
      },
    );

    return {
      data: {
        ok: response.data.ok === true,
        channelId: response.data.channel?.id ?? params.channel,
        invited: params.users,
      },
      metadata: { statusCode: response.status },
    };
  }
}
