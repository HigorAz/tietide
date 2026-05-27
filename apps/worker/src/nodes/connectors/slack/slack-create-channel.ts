import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { slackCreateChannelConfigSchema, type SlackOAuth2Config } from '@tietide/shared';
import { SlackClientFactory } from './slack-client.factory';

export const SLACK_CREATE_CHANNEL_TYPE = 'slack-create-channel';

interface SlackChannel {
  id?: string;
  name?: string;
  is_private?: boolean;
}

interface SlackCreateChannelResponse {
  ok?: boolean;
  channel?: SlackChannel;
}

@Injectable()
export class SlackCreateChannelAction extends BaseConnectorAction<SlackOAuth2Config> {
  readonly type = SLACK_CREATE_CHANNEL_TYPE;
  readonly name = 'Slack: Create Channel';
  readonly description = 'Create a public or private Slack channel';
  readonly requiredConnectionType = 'slack';

  constructor(private readonly client: SlackClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<SlackOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = slackCreateChannelConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: { name: params.name, isPrivate: params.isPrivate === true },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = { name: params.name };
    if (params.isPrivate !== undefined) payload.is_private = params.isPrivate;

    const response = await this.client.call<SlackCreateChannelResponse>(
      connection,
      '/conversations.create',
      { method: 'POST', body: JSON.stringify(payload) },
    );

    const channel = response.data.channel;
    return {
      data: {
        ok: response.data.ok === true,
        channelId: channel?.id ?? null,
        name: channel?.name ?? params.name,
        isPrivate: channel?.is_private ?? params.isPrivate ?? false,
      },
      metadata: { statusCode: response.status },
    };
  }
}
