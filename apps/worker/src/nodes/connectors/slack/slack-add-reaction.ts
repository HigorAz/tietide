import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { slackAddReactionConfigSchema, type SlackOAuth2Config } from '@tietide/shared';
import { SlackClientFactory } from './slack-client.factory';

export const SLACK_ADD_REACTION_TYPE = 'slack-add-reaction';

interface SlackOkResponse {
  ok?: boolean;
}

@Injectable()
export class SlackAddReactionAction extends BaseConnectorAction<SlackOAuth2Config> {
  readonly type = SLACK_ADD_REACTION_TYPE;
  readonly name = 'Slack: Add Reaction';
  readonly description = 'Add an emoji reaction to a Slack message';
  readonly requiredConnectionType = 'slack';

  constructor(private readonly client: SlackClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<SlackOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = slackAddReactionConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveReacted: {
            channel: params.channel,
            timestamp: params.timestamp,
            name: params.name,
          },
        },
        metadata: { mocked: true },
      };
    }

    const response = await this.client.call<SlackOkResponse>(connection, '/reactions.add', {
      method: 'POST',
      body: JSON.stringify({
        channel: params.channel,
        timestamp: params.timestamp,
        name: params.name,
      }),
    });

    return {
      data: { ok: response.data.ok === true },
      metadata: { statusCode: response.status },
    };
  }
}
