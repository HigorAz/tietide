import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { telegramSendMessageConfigSchema, type TelegramBotTokenConfig } from '@tietide/shared';
import { TelegramClientFactory } from './telegram-client.factory';

export const TELEGRAM_SEND_MESSAGE_TYPE = 'telegram-send-message';

interface TelegramSendMessageResponse {
  ok: boolean;
  result?: {
    message_id?: number;
    chat?: { id?: number | string };
    date?: number;
  };
}

@Injectable()
export class TelegramSendMessageAction extends BaseConnectorAction<TelegramBotTokenConfig> {
  readonly type = TELEGRAM_SEND_MESSAGE_TYPE;
  readonly name = 'Telegram: Send Message';
  readonly description = 'Send a message via a Telegram bot to a chat or channel';
  readonly requiredConnectionType = 'telegram';

  constructor(private readonly client: TelegramClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TelegramBotTokenConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = telegramSendMessageConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSent: {
            chatId: params.chatId,
            length: params.text.length,
            parseMode: params.parseMode ?? null,
          },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = {
      chat_id: params.chatId,
      text: params.text,
    };
    if (params.parseMode) payload.parse_mode = params.parseMode;
    if (params.disableNotification) payload.disable_notification = params.disableNotification;

    const response = await this.client.call<TelegramSendMessageResponse>(
      connection,
      'sendMessage',
      payload,
    );

    return {
      data: {
        ok: response.data?.ok === true,
        messageId: response.data?.result?.message_id ?? null,
        chatId: response.data?.result?.chat?.id ?? params.chatId,
      },
      metadata: { statusCode: response.status },
    };
  }
}
