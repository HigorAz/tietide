import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { twilioListMessagesConfigSchema, type TwilioApiKeyConfig } from '@tietide/shared';
import { TwilioClientFactory } from './twilio-client.factory';

export const TWILIO_LIST_MESSAGES_TYPE = 'twilio-list-messages';

interface TwilioMessageResource {
  sid?: string;
  status?: string;
  to?: string;
  from?: string;
  body?: string;
  date_sent?: string | null;
}

interface TwilioListResponse {
  messages?: TwilioMessageResource[];
}

@Injectable()
export class TwilioListMessagesAction extends BaseConnectorAction<TwilioApiKeyConfig> {
  readonly type = TWILIO_LIST_MESSAGES_TYPE;
  readonly name = 'Twilio: List Messages';
  readonly description = 'List recent Twilio messages, optionally filtered by to/from';
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
    const params = twilioListMessagesConfigSchema.parse(input.params);

    const query = new URLSearchParams();
    if (params.to) query.set('To', params.to);
    if (params.from) query.set('From', params.from);
    query.set('PageSize', String(params.pageSize ?? 20));

    const path = `/2010-04-01/Accounts/${connection.config.accountSid}/Messages.json?${query.toString()}`;
    const response = await this.client.call<TwilioListResponse>(connection, path, {
      method: 'GET',
    });

    const messages = response.data?.messages ?? [];
    return {
      data: {
        messages: messages.map((m) => ({
          sid: m.sid ?? null,
          status: m.status ?? null,
          to: m.to ?? null,
          from: m.from ?? null,
          body: m.body ?? null,
          dateSent: m.date_sent ?? null,
        })),
        count: messages.length,
      },
      metadata: { statusCode: response.status },
    };
  }
}
