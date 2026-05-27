import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { telegramEditMessageConfigSchema, type TelegramBotTokenConfig } from '@tietide/shared';
import { TelegramClientFactory } from './telegram-client.factory';

export const TELEGRAM_EDIT_MESSAGE_TYPE = 'telegram-edit-message';

interface TelegramEditResult {
  ok?: boolean;
  result?: { message_id?: number; chat?: { id?: number } } | boolean;
}

@Injectable()
export class TelegramEditMessageAction extends BaseConnectorAction<TelegramBotTokenConfig> {
  readonly type = TELEGRAM_EDIT_MESSAGE_TYPE;
  readonly name = 'Telegram: Edit Message';
  readonly description = 'Edit the text of a previously sent Telegram message';
  readonly requiredConnectionType = 'telegram';

  constructor(private readonly client: TelegramClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TelegramBotTokenConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = telegramEditMessageConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveEdited: { chatId: params.chatId, messageId: params.messageId },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = {
      chat_id: params.chatId,
      message_id: params.messageId,
      text: params.text,
    };
    if (params.parseMode) payload.parse_mode = params.parseMode;

    const response = await this.client.call<TelegramEditResult>(
      connection,
      'editMessageText',
      payload,
    );

    const result = response.data?.result;
    const messageId =
      typeof result === 'object' && result ? (result.message_id ?? null) : params.messageId;
    return {
      data: { ok: response.data?.ok === true, messageId },
      metadata: { statusCode: response.status },
    };
  }
}
