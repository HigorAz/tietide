import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { telegramSendDocumentConfigSchema, type TelegramBotTokenConfig } from '@tietide/shared';
import { TelegramClientFactory } from './telegram-client.factory';

export const TELEGRAM_SEND_DOCUMENT_TYPE = 'telegram-send-document';

interface TelegramSendResult {
  ok?: boolean;
  result?: { message_id?: number; chat?: { id?: number } };
}

@Injectable()
export class TelegramSendDocumentAction extends BaseConnectorAction<TelegramBotTokenConfig> {
  readonly type = TELEGRAM_SEND_DOCUMENT_TYPE;
  readonly name = 'Telegram: Send Document';
  readonly description = 'Send a document to a Telegram chat by URL, file_id, or base64 upload';
  readonly requiredConnectionType = 'telegram';

  constructor(private readonly client: TelegramClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TelegramBotTokenConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = telegramSendDocumentConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveSent: { chatId: params.chatId, source: params.source } },
        metadata: { mocked: true },
      };
    }

    let response: { status: number; data: TelegramSendResult | null };
    if (params.source === 'upload') {
      const fields: Record<string, string> = { chat_id: params.chatId };
      if (params.caption) fields.caption = params.caption;
      if (params.parseMode) fields.parse_mode = params.parseMode;
      response = await this.client.callMultipart<TelegramSendResult>(
        connection,
        'sendDocument',
        fields,
        {
          field: 'document',
          filename: params.filename as string,
          content: Buffer.from(params.contentBase64 as string, 'base64'),
        },
      );
    } else {
      const payload: Record<string, unknown> = {
        chat_id: params.chatId,
        document: params.source === 'url' ? params.url : params.fileId,
      };
      if (params.caption) payload.caption = params.caption;
      if (params.parseMode) payload.parse_mode = params.parseMode;
      response = await this.client.call<TelegramSendResult>(connection, 'sendDocument', payload);
    }

    return {
      data: {
        ok: response.data?.ok === true,
        messageId: response.data?.result?.message_id ?? null,
        chatId: response.data?.result?.chat?.id ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
