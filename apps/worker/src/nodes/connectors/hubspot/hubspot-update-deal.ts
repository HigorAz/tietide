import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { hubspotUpdateDealConfigSchema, type HubspotOAuth2Config } from '@tietide/shared';
import { HubspotClientFactory } from './hubspot-client.factory';

export const HUBSPOT_UPDATE_DEAL_TYPE = 'hubspot-update-deal';

interface HubspotDealResponse {
  id?: string;
  properties?: Record<string, unknown>;
  updatedAt?: string;
}

@Injectable()
export class HubspotUpdateDealAction extends BaseConnectorAction<HubspotOAuth2Config> {
  readonly type = HUBSPOT_UPDATE_DEAL_TYPE;
  readonly name = 'HubSpot: Update Deal';
  readonly description = 'Update properties on an existing HubSpot deal';
  readonly requiredConnectionType = 'hubspot';

  constructor(private readonly client: HubspotClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<HubspotOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = hubspotUpdateDealConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveUpdated: { dealId: params.dealId } },
        metadata: { mocked: true },
      };
    }

    const response = await this.client.call<HubspotDealResponse>(
      connection,
      `/crm/v3/objects/deals/${encodeURIComponent(params.dealId)}`,
      { method: 'PATCH', body: JSON.stringify({ properties: params.properties }) },
    );

    return {
      data: {
        id: response.data.id ?? null,
        properties: response.data.properties ?? null,
        updatedAt: response.data.updatedAt ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
