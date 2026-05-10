import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { hubspotCreateDealConfigSchema, type HubspotOAuth2Config } from '@tietide/shared';
import { HubspotClientFactory } from './hubspot-client.factory';

export const HUBSPOT_CREATE_DEAL_TYPE = 'hubspot-create-deal';

// HubSpot association type for "deal-to-contact" is the well-known id 3
// (https://developers.hubspot.com/docs/api/crm/associations#default-association-type-ids).
const DEAL_TO_CONTACT_ASSOCIATION_TYPE_ID = 3;

interface HubspotDealResponse {
  id?: string;
  properties?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class HubspotCreateDealAction extends BaseConnectorAction<HubspotOAuth2Config> {
  readonly type = HUBSPOT_CREATE_DEAL_TYPE;
  readonly name = 'HubSpot: Create Deal';
  readonly description = 'Create a deal and optionally associate contacts';
  readonly requiredConnectionType = 'hubspot';

  constructor(private readonly client: HubspotClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<HubspotOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = hubspotCreateDealConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: {
            name: params.name,
            amount: params.amount,
            contactCount: params.contactIds?.length ?? 0,
          },
        },
        metadata: { mocked: true },
      };
    }

    const properties: Record<string, unknown> = {
      dealname: params.name,
      ...(params.amount !== undefined ? { amount: String(params.amount) } : {}),
      ...(params.pipelineId ? { pipeline: params.pipelineId } : {}),
      ...(params.stageId ? { dealstage: params.stageId } : {}),
      ...(params.properties ?? {}),
    };

    const payload: Record<string, unknown> = { properties };
    if (params.contactIds && params.contactIds.length > 0) {
      payload.associations = params.contactIds.map((contactId) => ({
        to: { id: contactId },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: DEAL_TO_CONTACT_ASSOCIATION_TYPE_ID,
          },
        ],
      }));
    }

    const response = await this.client.call<HubspotDealResponse>(
      connection,
      '/crm/v3/objects/deals',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );

    return {
      data: {
        id: response.data.id ?? null,
        properties: response.data.properties ?? null,
        createdAt: response.data.createdAt ?? null,
        updatedAt: response.data.updatedAt ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
