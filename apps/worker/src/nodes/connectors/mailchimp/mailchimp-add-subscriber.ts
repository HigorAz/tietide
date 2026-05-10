import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { mailchimpAddSubscriberConfigSchema, type MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpClientFactory } from './mailchimp-client.factory';

export const MAILCHIMP_ADD_SUBSCRIBER_TYPE = 'mailchimp-add-subscriber';

interface MailchimpMemberResponse {
  id?: string;
  email_address?: string;
  status?: string;
  list_id?: string;
  merge_fields?: Record<string, unknown>;
}

// Mailchimp's PUT-by-subscriber-hash uses md5(lowercase(email)) as the path id.
// Using PUT (rather than POST) makes the call idempotent — first call creates
// the member, repeats update them. This avoids 400 "Member Exists" responses
// for legitimate retries.
function subscriberHash(email: string): string {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

@Injectable()
export class MailchimpAddSubscriberAction extends BaseConnectorAction<MailchimpApiKeyConfig> {
  readonly type = MAILCHIMP_ADD_SUBSCRIBER_TYPE;
  readonly name = 'Mailchimp: Add Subscriber';
  readonly description = 'Add a subscriber to a Mailchimp audience list';
  readonly requiredConnectionType = 'mailchimp';

  constructor(private readonly client: MailchimpClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MailchimpApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = mailchimpAddSubscriberConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveAdded: { email: params.email, listId: params.listId, status: params.status },
        },
        metadata: { mocked: true },
      };
    }

    const hash = subscriberHash(params.email);
    const payload: Record<string, unknown> = {
      email_address: params.email,
      status_if_new: params.status,
      ...(params.mergeFields ? { merge_fields: params.mergeFields } : {}),
    };

    const response = await this.client.call<MailchimpMemberResponse>(
      connection,
      `/lists/${params.listId}/members/${hash}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );

    return {
      data: {
        id: response.data.id ?? null,
        email: response.data.email_address ?? null,
        status: response.data.status ?? null,
        listId: response.data.list_id ?? params.listId,
        mergeFields: response.data.merge_fields ?? {},
      },
      metadata: { statusCode: response.status },
    };
  }
}
