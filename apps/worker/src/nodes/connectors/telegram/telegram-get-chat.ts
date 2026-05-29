import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { telegramGetChatConfigSchema, type TelegramBotTokenConfig } from '@tietide/shared';
import { TelegramClientFactory } from './telegram-client.factory';

export const TELEGRAM_GET_CHAT_TYPE = 'telegram-get-chat';

interface TelegramChat {
  id?: number;
  type?: string;
  title?: string;
  username?: string;
  description?: string;
}

interface TelegramGetChatResponse {
  ok?: boolean;
  result?: TelegramChat;
}

@Injectable()
export class TelegramGetChatAction extends BaseConnectorAction<TelegramBotTokenConfig> {
  readonly type = TELEGRAM_GET_CHAT_TYPE;
  readonly name = 'Telegram: Get Chat';
  readonly description = 'Fetch metadata about a Telegram chat (getChat)';
  readonly requiredConnectionType = 'telegram';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: TelegramClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TelegramBotTokenConfig>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = telegramGetChatConfigSchema.parse(input.params);

    const response = await this.client.call<TelegramGetChatResponse>(connection, 'getChat', {
      chat_id: params.chatId,
    });

    const chat = response.data?.result;
    return {
      data: {
        id: chat?.id ?? null,
        type: chat?.type ?? null,
        title: chat?.title ?? null,
        username: chat?.username ?? null,
        description: chat?.description ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
