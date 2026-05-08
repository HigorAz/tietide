import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { twilioSendWhatsAppConfigSchema, type TwilioApiKeyConfig } from '@tietide/shared';
import { TwilioClientFactory } from './twilio-client.factory';

export const TWILIO_SEND_WHATSAPP_TYPE = 'twilio-send-whatsapp';

interface TwilioMessageResource {
  sid?: string;
  status?: string;
  to?: string;
  from?: string;
}

@Injectable()
export class TwilioSendWhatsAppAction extends BaseConnectorAction<TwilioApiKeyConfig> {
  readonly type = TWILIO_SEND_WHATSAPP_TYPE;
  readonly name = 'Twilio: Send WhatsApp Template';
  readonly description = 'Send a Twilio WhatsApp message using an approved Content template';
  readonly requiredConnectionType = 'twilio';

  constructor(private readonly client: TwilioClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TwilioApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = twilioSendWhatsAppConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSent: {
            to: params.to,
            from: params.from,
            contentSid: params.contentSid,
            variableCount: Object.keys(params.contentVariables ?? {}).length,
          },
        },
        metadata: { mocked: true },
      };
    }

    const form = new URLSearchParams();
    form.set('To', params.to);
    form.set('From', params.from);
    form.set('ContentSid', params.contentSid);
    if (params.contentVariables && Object.keys(params.contentVariables).length > 0) {
      form.set('ContentVariables', JSON.stringify(params.contentVariables));
    }

    const path = `/2010-04-01/Accounts/${connection.config.accountSid}/Messages.json`;
    const response = await this.client.call<TwilioMessageResource>(connection, path, {
      method: 'POST',
      body: form,
    });

    return {
      data: {
        sid: response.data?.sid ?? null,
        status: response.data?.status ?? null,
        to: response.data?.to ?? params.to,
        from: response.data?.from ?? params.from,
      },
      metadata: { statusCode: response.status },
    };
  }
}
