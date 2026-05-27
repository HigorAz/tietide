import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { mailchimpUnsubscribeConfigSchema, type MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpClientFactory } from './mailchimp-client.factory';

export const MAILCHIMP_UNSUBSCRIBE_TYPE = 'mailchimp-unsubscribe';

interface MailchimpMemberResponse {
  id?: string;
  email_address?: string;
  status?: string;
}

function subscriberHash(email: string): string {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

@Injectable()
export class MailchimpUnsubscribeAction extends BaseConnectorAction<MailchimpApiKeyConfig> {
  readonly type = MAILCHIMP_UNSUBSCRIBE_TYPE;
  readonly name = 'Mailchimp: Unsubscribe';
  readonly description = 'Unsubscribe a member from a Mailchimp audience';
  readonly requiredConnectionType = 'mailchimp';

  constructor(private readonly client: MailchimpClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MailchimpApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = mailchimpUnsubscribeConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveUnsubscribed: { email: params.email, listId: params.listId },
        },
        metadata: { mocked: true },
      };
    }

    const hash = subscriberHash(params.email);
    const response = await this.client.call<MailchimpMemberResponse>(
      connection,
      `/lists/${params.listId}/members/${hash}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'unsubscribed' }) },
    );

    return {
      data: {
        id: response.data.id ?? null,
        email: response.data.email_address ?? null,
        status: response.data.status ?? 'unsubscribed',
      },
      metadata: { statusCode: response.status },
    };
  }
}
