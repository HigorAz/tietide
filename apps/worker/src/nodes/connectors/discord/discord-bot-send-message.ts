import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { discordBotSendMessageConfigSchema, type DiscordBotConfig } from '@tietide/shared';
import { DiscordBotClientFactory } from './discord-bot-client.factory';

export const DISCORD_BOT_SEND_MESSAGE_TYPE = 'discord-bot-send-message';

interface DiscordMessage {
  id?: string;
  channel_id?: string;
}

@Injectable()
export class DiscordBotSendMessageAction extends BaseConnectorAction<DiscordBotConfig> {
  readonly type = DISCORD_BOT_SEND_MESSAGE_TYPE;
  readonly name = 'Discord: Send Message (Bot)';
  readonly description = 'Post a message to a Discord channel using a bot token (REST API)';
  readonly requiredConnectionType = 'discord-bot';

  constructor(private readonly client: DiscordBotClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<DiscordBotConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = discordBotSendMessageConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSent: { channelId: params.channelId, length: params.content.length },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = { content: params.content };
    if (params.embeds) payload.embeds = params.embeds;

    const response = await this.client.call<DiscordMessage>(
      connection.config.botToken,
      'POST',
      `/channels/${params.channelId}/messages`,
      payload,
    );

    return {
      data: {
        ok: true,
        messageId: response.data?.id ?? null,
        channelId: response.data?.channel_id ?? params.channelId,
      },
      metadata: { statusCode: response.status },
    };
  }
}
