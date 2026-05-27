import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { twilioMakeCallConfigSchema, type TwilioApiKeyConfig } from '@tietide/shared';
import { TwilioClientFactory } from './twilio-client.factory';

export const TWILIO_MAKE_CALL_TYPE = 'twilio-make-call';

interface TwilioCallResource {
  sid?: string;
  status?: string;
  to?: string;
  from?: string;
}

@Injectable()
export class TwilioMakeCallAction extends BaseConnectorAction<TwilioApiKeyConfig> {
  readonly type = TWILIO_MAKE_CALL_TYPE;
  readonly name = 'Twilio: Make Call';
  readonly description =
    'Place an outbound voice call via Twilio using a TwiML URL or inline TwiML';
  readonly requiredConnectionType = 'twilio';

  constructor(private readonly client: TwilioClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TwilioApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = twilioMakeCallConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveCalled: { to: params.to, from: params.from } },
        metadata: { mocked: true },
      };
    }

    const form = new URLSearchParams();
    form.set('To', params.to);
    form.set('From', params.from);
    if (params.url) form.set('Url', params.url);
    if (params.twiml) form.set('Twiml', params.twiml);

    const path = `/2010-04-01/Accounts/${connection.config.accountSid}/Calls.json`;
    const response = await this.client.call<TwilioCallResource>(connection, path, {
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
