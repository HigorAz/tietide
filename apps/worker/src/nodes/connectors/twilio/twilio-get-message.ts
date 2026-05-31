import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { twilioGetMessageConfigSchema, type TwilioApiKeyConfig } from '@tietide/shared';
import { TwilioClientFactory } from './twilio-client.factory';

export const TWILIO_GET_MESSAGE_TYPE = 'twilio-get-message';

interface TwilioMessageResource {
  sid?: string;
  status?: string;
  to?: string;
  from?: string;
  body?: string;
  error_code?: number | null;
  error_message?: string | null;
  date_sent?: string | null;
}

@Injectable()
export class TwilioGetMessageAction extends BaseConnectorAction<TwilioApiKeyConfig> {
  readonly type = TWILIO_GET_MESSAGE_TYPE;
  readonly name = 'Twilio: Get Message';
  readonly description = 'Fetch a Twilio message and its delivery status by SID';
  readonly requiredConnectionType = 'twilio';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: TwilioClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TwilioApiKeyConfig>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = twilioGetMessageConfigSchema.parse(input.params);

    const path = `/2010-04-01/Accounts/${connection.config.accountSid}/Messages/${params.messageSid}.json`;
    const response = await this.client.call<TwilioMessageResource>(connection, path, {
      method: 'GET',
    });

    const m = response.data;
    return {
      data: {
        sid: m?.sid ?? params.messageSid,
        status: m?.status ?? null,
        to: m?.to ?? null,
        from: m?.from ?? null,
        body: m?.body ?? null,
        errorCode: m?.error_code ?? null,
        errorMessage: m?.error_message ?? null,
        dateSent: m?.date_sent ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
