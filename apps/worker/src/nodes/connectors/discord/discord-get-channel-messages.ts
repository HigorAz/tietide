import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { discordGetChannelMessagesConfigSchema, type DiscordBotConfig } from '@tietide/shared';
import { DiscordBotClientFactory } from './discord-bot-client.factory';

export const DISCORD_GET_CHANNEL_MESSAGES_TYPE = 'discord-get-channel-messages';

interface DiscordApiMessage {
  id?: string;
  content?: string;
  timestamp?: string;
  author?: { id?: string; username?: string };
}

@Injectable()
export class DiscordGetChannelMessagesAction extends BaseConnectorAction<DiscordBotConfig> {
  readonly type = DISCORD_GET_CHANNEL_MESSAGES_TYPE;
  readonly name = 'Discord: Get Channel Messages';
  readonly description = 'Read recent messages from a Discord channel using a bot token';
  readonly requiredConnectionType = 'discord-bot';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: DiscordBotClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<DiscordBotConfig>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = discordGetChannelMessagesConfigSchema.parse(input.params);

    const search = new URLSearchParams();
    if (params.limit) search.set('limit', String(params.limit));
    const query = search.toString();
    const path = `/channels/${params.channelId}/messages${query ? `?${query}` : ''}`;

    const response = await this.client.call<DiscordApiMessage[]>(
      connection.config.botToken,
      'GET',
      path,
    );

    const messages = Array.isArray(response.data) ? response.data : [];
    return {
      data: {
        messages: messages.map((m) => ({
          id: m.id ?? null,
          content: m.content ?? null,
          authorId: m.author?.id ?? null,
          authorUsername: m.author?.username ?? null,
          timestamp: m.timestamp ?? null,
        })),
        count: messages.length,
      },
      metadata: { statusCode: response.status },
    };
  }
}
