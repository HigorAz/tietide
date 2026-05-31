import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { mailchimpGetSubscriberConfigSchema, type MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpClientFactory } from './mailchimp-client.factory';

export const MAILCHIMP_GET_SUBSCRIBER_TYPE = 'mailchimp-get-subscriber';

interface MailchimpMemberResponse {
  id?: string;
  email_address?: string;
  status?: string;
  merge_fields?: Record<string, unknown>;
  tags?: Array<Record<string, unknown>>;
}

// Mailchimp identifies members by md5(lowercase(email)).
function subscriberHash(email: string): string {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

@Injectable()
export class MailchimpGetSubscriberAction extends BaseConnectorAction<MailchimpApiKeyConfig> {
  readonly type = MAILCHIMP_GET_SUBSCRIBER_TYPE;
  readonly name = 'Mailchimp: Get Subscriber';
  readonly description = 'Fetch a Mailchimp audience member by email';
  readonly requiredConnectionType = 'mailchimp';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: MailchimpClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MailchimpApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = mailchimpGetSubscriberConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return { data: { mocked: true, member: null }, metadata: { mocked: true } };
    }

    const hash = subscriberHash(params.email);
    const response = await this.client.call<MailchimpMemberResponse>(
      connection,
      `/lists/${params.listId}/members/${hash}`,
      { method: 'GET' },
    );

    return {
      data: {
        id: response.data.id ?? null,
        email: response.data.email_address ?? null,
        status: response.data.status ?? null,
        mergeFields: response.data.merge_fields ?? {},
        tags: response.data.tags ?? [],
      },
      metadata: { statusCode: response.status },
    };
  }
}
