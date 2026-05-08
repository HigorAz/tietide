import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { twilioSendSmsConfigSchema, type TwilioApiKeyConfig } from '@tietide/shared';
import { TwilioClientFactory } from './twilio-client.factory';

export const TWILIO_SEND_SMS_TYPE = 'twilio-send-sms';

interface TwilioMessageResource {
  sid?: string;
  status?: string;
  to?: string;
  from?: string;
}

@Injectable()
export class TwilioSendSmsAction extends BaseConnectorAction<TwilioApiKeyConfig> {
  readonly type = TWILIO_SEND_SMS_TYPE;
  readonly name = 'Twilio: Send SMS';
  readonly description = 'Send an SMS via Twilio to an E.164 number';
  readonly requiredConnectionType = 'twilio';

  constructor(private readonly client: TwilioClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TwilioApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = twilioSendSmsConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSent: { to: params.to, from: params.from, length: params.body.length },
        },
        metadata: { mocked: true },
      };
    }

    const form = new URLSearchParams();
    form.set('To', params.to);
    form.set('From', params.from);
    form.set('Body', params.body);

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
