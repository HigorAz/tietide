import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { mailchimpListCampaignsConfigSchema, type MailchimpApiKeyConfig } from '@tietide/shared';
import { MailchimpClientFactory } from './mailchimp-client.factory';

export const MAILCHIMP_LIST_CAMPAIGNS_TYPE = 'mailchimp-list-campaigns';

interface MailchimpCampaignListResponse {
  campaigns?: Array<Record<string, unknown>>;
  total_items?: number;
}

@Injectable()
export class MailchimpListCampaignsAction extends BaseConnectorAction<MailchimpApiKeyConfig> {
  readonly type = MAILCHIMP_LIST_CAMPAIGNS_TYPE;
  readonly name = 'Mailchimp: List Campaigns';
  readonly description = 'List Mailchimp campaigns, optionally filtered by status';
  readonly requiredConnectionType = 'mailchimp';

  constructor(private readonly client: MailchimpClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MailchimpApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = mailchimpListCampaignsConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return { data: { mocked: true, campaigns: [], totalItems: 0 }, metadata: { mocked: true } };
    }

    const query = new URLSearchParams({ count: String(params.count) });
    if (params.status) query.set('status', params.status);

    const response = await this.client.call<MailchimpCampaignListResponse>(
      connection,
      `/campaigns?${query.toString()}`,
      { method: 'GET' },
    );

    return {
      data: {
        campaigns: response.data.campaigns ?? [],
        totalItems: response.data.total_items ?? response.data.campaigns?.length ?? 0,
        count: response.data.campaigns?.length ?? 0,
      },
      metadata: { statusCode: response.status },
    };
  }
}
