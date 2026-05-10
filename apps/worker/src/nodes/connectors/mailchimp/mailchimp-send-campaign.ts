import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { mailchimpSendCampaignConfigSchema, type MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpClientFactory } from './mailchimp-client.factory';

export const MAILCHIMP_SEND_CAMPAIGN_TYPE = 'mailchimp-send-campaign';

@Injectable()
export class MailchimpSendCampaignAction extends BaseConnectorAction<MailchimpApiKeyConfig> {
  readonly type = MAILCHIMP_SEND_CAMPAIGN_TYPE;
  readonly name = 'Mailchimp: Send Campaign';
  readonly description = 'Send a previously-created Mailchimp campaign';
  readonly requiredConnectionType = 'mailchimp';

  constructor(private readonly client: MailchimpClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MailchimpApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = mailchimpSendCampaignConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveSent: { campaignId: params.campaignId } },
        metadata: { mocked: true },
      };
    }

    // Mailchimp returns 204 No Content on successful send-action.
    const response = await this.client.call(
      connection,
      `/campaigns/${params.campaignId}/actions/send`,
      { method: 'POST' },
    );

    return {
      data: { campaignId: params.campaignId, sent: true },
      metadata: { statusCode: response.status },
    };
  }
}
