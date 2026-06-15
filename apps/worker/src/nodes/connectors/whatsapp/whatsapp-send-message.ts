import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { whatsappSendMessageConfigSchema, type WhatsappOAuth2Config } from '@tietide/shared';
import { MetaGraphClientFactory } from '../meta/meta-graph-client.factory';

export const WHATSAPP_SEND_MESSAGE_TYPE = 'whatsapp-send-message';

interface WhatsappMessagesResponse {
  messages?: Array<{ id?: string }>;
}

@Injectable()
export class WhatsappSendMessageAction extends BaseConnectorAction<WhatsappOAuth2Config> {
  readonly type = WHATSAPP_SEND_MESSAGE_TYPE;
  readonly name = 'WhatsApp: Send Message';
  readonly description = 'Send a free-form text message from a WhatsApp Business number';
  readonly requiredConnectionType = 'whatsapp';

  constructor(private readonly client: MetaGraphClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<WhatsappOAuth2Config>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = whatsappSendMessageConfigSchema.parse(input.params);

    const response = await this.client.call<WhatsappMessagesResponse>(
      connection,
      `/${params.phoneNumberId}/messages`,
      {
        method: 'POST',
        body: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: params.to,
          type: 'text',
          text: { body: params.message, preview_url: false },
        },
      },
    );

    return {
      data: {
        messageId: response.data.messages?.[0]?.id ?? null,
        to: params.to,
      },
      metadata: { statusCode: response.status },
    };
  }
}
