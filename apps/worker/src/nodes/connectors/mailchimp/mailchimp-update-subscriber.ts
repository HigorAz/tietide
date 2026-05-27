import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { mailchimpUpdateSubscriberConfigSchema, type MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpClientFactory } from './mailchimp-client.factory';

export const MAILCHIMP_UPDATE_SUBSCRIBER_TYPE = 'mailchimp-update-subscriber';

interface MailchimpMemberResponse {
  id?: string;
  email_address?: string;
  status?: string;
  merge_fields?: Record<string, unknown>;
}

function subscriberHash(email: string): string {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

@Injectable()
export class MailchimpUpdateSubscriberAction extends BaseConnectorAction<MailchimpApiKeyConfig> {
  readonly type = MAILCHIMP_UPDATE_SUBSCRIBER_TYPE;
  readonly name = 'Mailchimp: Update Subscriber';
  readonly description = 'Update a Mailchimp member’s status or merge fields';
  readonly requiredConnectionType = 'mailchimp';

  constructor(private readonly client: MailchimpClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MailchimpApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = mailchimpUpdateSubscriberConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveUpdated: { email: params.email, listId: params.listId } },
        metadata: { mocked: true },
      };
    }

    const hash = subscriberHash(params.email);
    const payload: Record<string, unknown> = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.mergeFields ? { merge_fields: params.mergeFields } : {}),
    };

    const response = await this.client.call<MailchimpMemberResponse>(
      connection,
      `/lists/${params.listId}/members/${hash}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
    );

    return {
      data: {
        id: response.data.id ?? null,
        email: response.data.email_address ?? null,
        status: response.data.status ?? null,
        mergeFields: response.data.merge_fields ?? {},
      },
      metadata: { statusCode: response.status },
    };
  }
}
