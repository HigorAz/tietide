import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { slackUpdateMessageConfigSchema, type SlackOAuth2Config } from '@tietide/shared';
import { SlackClientFactory } from './slack-client.factory';

export const SLACK_UPDATE_MESSAGE_TYPE = 'slack-update-message';

interface SlackUpdateResponse {
  ok?: boolean;
  channel?: string;
  ts?: string;
  text?: string;
}

@Injectable()
export class SlackUpdateMessageAction extends BaseConnectorAction<SlackOAuth2Config> {
  readonly type = SLACK_UPDATE_MESSAGE_TYPE;
  readonly name = 'Slack: Update Message';
  readonly description = 'Edit a previously posted Slack message by timestamp';
  readonly requiredConnectionType = 'slack';

  constructor(private readonly client: SlackClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<SlackOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = slackUpdateMessageConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveUpdated: { channel: params.channel, ts: params.ts } },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = {
      channel: params.channel,
      ts: params.ts,
      text: params.text,
    };
    if (params.blocks) payload.blocks = params.blocks;

    const response = await this.client.call<SlackUpdateResponse>(connection, '/chat.update', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      data: {
        ok: response.data.ok === true,
        channel: response.data.channel ?? params.channel,
        ts: response.data.ts ?? params.ts,
      },
      metadata: { statusCode: response.status },
    };
  }
}
