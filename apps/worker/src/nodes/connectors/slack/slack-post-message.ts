import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { slackPostMessageConfigSchema, type SlackOAuth2Config } from '@tietide/shared';
import { SlackClientFactory } from './slack-client.factory';

export const SLACK_POST_MESSAGE_TYPE = 'slack-post-message';

interface SlackPostMessageResponse {
  ok: boolean;
  channel?: string;
  ts?: string;
  message?: { ts?: string; text?: string };
}

@Injectable()
export class SlackPostMessageAction extends BaseConnectorAction<SlackOAuth2Config> {
  readonly type = SLACK_POST_MESSAGE_TYPE;
  readonly name = 'Slack: Post Message';
  readonly description = 'Post a message to a Slack channel by ID';
  readonly requiredConnectionType = 'slack';

  constructor(private readonly client: SlackClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<SlackOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = slackPostMessageConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSent: {
            channel: params.channel,
            text: params.text,
            blockCount: params.blocks?.length ?? 0,
          },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = {
      channel: params.channel,
      text: params.text,
    };
    if (params.blocks) payload.blocks = params.blocks;
    if (params.threadTs) payload.thread_ts = params.threadTs;

    const response = await this.client.call<SlackPostMessageResponse>(
      connection,
      '/chat.postMessage',
      { method: 'POST', body: JSON.stringify(payload) },
    );

    return {
      data: {
        ok: response.data.ok === true,
        channel: response.data.channel ?? params.channel,
        ts: response.data.ts ?? response.data.message?.ts ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
