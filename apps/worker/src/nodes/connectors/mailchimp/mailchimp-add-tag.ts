import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { mailchimpAddTagConfigSchema, type MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpClientFactory } from './mailchimp-client.factory';

export const MAILCHIMP_ADD_TAG_TYPE = 'mailchimp-add-tag';

function subscriberHash(email: string): string {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

@Injectable()
export class MailchimpAddTagAction extends BaseConnectorAction<MailchimpApiKeyConfig> {
  readonly type = MAILCHIMP_ADD_TAG_TYPE;
  readonly name = 'Mailchimp: Add Tag';
  readonly description = 'Add one or more tags to a Mailchimp audience member';
  readonly requiredConnectionType = 'mailchimp';

  constructor(private readonly client: MailchimpClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MailchimpApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = mailchimpAddTagConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveTagged: { email: params.email, tags: params.tags } },
        metadata: { mocked: true },
      };
    }

    const hash = subscriberHash(params.email);
    const payload = {
      tags: params.tags.map((name) => ({ name, status: 'active' })),
    };

    // The tags endpoint returns 204 No Content on success.
    const response = await this.client.call(
      connection,
      `/lists/${params.listId}/members/${hash}/tags`,
      { method: 'POST', body: JSON.stringify(payload) },
    );

    return {
      data: { tagged: true, email: params.email, tags: params.tags },
      metadata: { statusCode: response.status },
    };
  }
}
