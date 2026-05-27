import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { slackGetChannelHistoryConfigSchema, type SlackOAuth2Config } from '@tietide/shared';
import { SlackClientFactory } from './slack-client.factory';

export const SLACK_GET_CHANNEL_HISTORY_TYPE = 'slack-get-channel-history';

interface SlackHistoryMessage {
  type?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
}

interface SlackHistoryResponse {
  ok?: boolean;
  messages?: SlackHistoryMessage[];
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
}

@Injectable()
export class SlackGetChannelHistoryAction extends BaseConnectorAction<SlackOAuth2Config> {
  readonly type = SLACK_GET_CHANNEL_HISTORY_TYPE;
  readonly name = 'Slack: Get Channel History';
  readonly description = 'Read recent messages from a Slack channel';
  readonly requiredConnectionType = 'slack';

  constructor(private readonly client: SlackClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<SlackOAuth2Config>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = slackGetChannelHistoryConfigSchema.parse(input.params);

    const search = new URLSearchParams({ channel: params.channel });
    if (params.limit) search.set('limit', String(params.limit));
    if (params.oldest) search.set('oldest', params.oldest);
    if (params.latest) search.set('latest', params.latest);

    const response = await this.client.call<SlackHistoryResponse>(
      connection,
      `/conversations.history?${search.toString()}`,
      { method: 'GET' },
    );

    const messages = response.data.messages ?? [];
    return {
      data: {
        messages: messages.map((m) => ({
          user: m.user ?? null,
          text: m.text ?? null,
          ts: m.ts ?? null,
          threadTs: m.thread_ts ?? null,
        })),
        count: messages.length,
        hasMore: response.data.has_more === true,
        nextCursor: response.data.response_metadata?.next_cursor ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
