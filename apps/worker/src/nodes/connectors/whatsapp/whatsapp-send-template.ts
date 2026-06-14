import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { whatsappSendTemplateConfigSchema, type WhatsappOAuth2Config } from '@tietide/shared';
import { MetaGraphClientFactory } from '../meta/meta-graph-client.factory';

export const WHATSAPP_SEND_TEMPLATE_TYPE = 'whatsapp-send-template';

interface WhatsappMessagesResponse {
  messages?: Array<{ id?: string }>;
}

@Injectable()
export class WhatsappSendTemplateAction extends BaseConnectorAction<WhatsappOAuth2Config> {
  readonly type = WHATSAPP_SEND_TEMPLATE_TYPE;
  readonly name = 'WhatsApp: Send Template';
  readonly description = 'Send a pre-approved WhatsApp template message';
  readonly requiredConnectionType = 'whatsapp';

  constructor(private readonly client: MetaGraphClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<WhatsappOAuth2Config>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = whatsappSendTemplateConfigSchema.parse(input.params);

    const components =
      params.bodyParams && params.bodyParams.length > 0
        ? [
            {
              type: 'body',
              parameters: params.bodyParams.map((text) => ({ type: 'text', text })),
            },
          ]
        : [];

    const response = await this.client.call<WhatsappMessagesResponse>(
      connection,
      `/${params.phoneNumberId}/messages`,
      {
        method: 'POST',
        body: {
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'template',
          template: {
            name: params.templateName,
            language: { code: params.languageCode },
            ...(components.length > 0 ? { components } : {}),
          },
        },
      },
    );

    return {
      data: {
        messageId: response.data.messages?.[0]?.id ?? null,
        to: params.to,
        templateName: params.templateName,
      },
      metadata: { statusCode: response.status },
    };
  }
}
