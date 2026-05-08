import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  ConnectorMisconfiguredError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { slackPostToChannelConfigSchema, type SlackOAuth2Config } from '@tietide/shared';
import { SlackClientFactory } from './slack-client.factory';

export const SLACK_POST_TO_CHANNEL_TYPE = 'slack-post-to-channel';

interface SlackChannelsListResponse {
  ok: boolean;
  channels?: Array<{ id: string; name: string; is_archived?: boolean }>;
  response_metadata?: { next_cursor?: string };
}

interface SlackPostMessageResponse {
  ok: boolean;
  channel?: string;
  ts?: string;
  message?: { ts?: string };
}

@Injectable()
export class SlackPostToChannelAction extends BaseConnectorAction<SlackOAuth2Config> {
  readonly type = SLACK_POST_TO_CHANNEL_TYPE;
  readonly name = 'Slack: Post to Channel by Name';
  readonly description = 'Look up a Slack channel by name and post a message';
  readonly requiredConnectionType = 'slack';

  constructor(private readonly client: SlackClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<SlackOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = slackPostToChannelConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSent: {
            channelName: params.channelName,
            text: params.text,
          },
        },
        metadata: { mocked: true },
      };
    }

    const channelId = await this.resolveChannelId(connection, params.channelName);
    if (!channelId) {
      throw new ConnectorMisconfiguredError(
        `Slack channel not found: #${params.channelName}`,
        this.type,
      );
    }

    const payload: Record<string, unknown> = {
      channel: channelId,
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
        channel: response.data.channel ?? channelId,
        channelName: params.channelName,
        ts: response.data.ts ?? response.data.message?.ts ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }

  // Walk Slack's paginated conversations.list. Bounded by 5 pages (≈1000 channels)
  // so a misconfigured large workspace can't stall the worker indefinitely.
  private async resolveChannelId(
    connection: DecryptedConnection<SlackOAuth2Config>,
    name: string,
  ): Promise<string | null> {
    const target = name.toLowerCase();
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const qs = new URLSearchParams({
        limit: '200',
        types: 'public_channel,private_channel',
        exclude_archived: 'true',
      });
      if (cursor) qs.set('cursor', cursor);

      const response = await this.client.call<SlackChannelsListResponse>(
        connection,
        `/conversations.list?${qs.toString()}`,
        { method: 'GET' },
      );

      const list = response.data.channels ?? [];
      const match = list.find((c) => c.name.toLowerCase() === target);
      if (match) return match.id;

      const next = response.data.response_metadata?.next_cursor;
      if (!next) return null;
      cursor = next;
    }
    return null;
  }
}
