import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { hubspotUpdateContactConfigSchema, type HubspotOAuth2Config } from '@tietide/shared';
import { HubspotClientFactory } from './hubspot-client.factory';

export const HUBSPOT_UPDATE_CONTACT_TYPE = 'hubspot-update-contact';

interface HubspotContactResponse {
  id?: string;
  properties?: Record<string, unknown>;
  updatedAt?: string;
}

@Injectable()
export class HubspotUpdateContactAction extends BaseConnectorAction<HubspotOAuth2Config> {
  readonly type = HUBSPOT_UPDATE_CONTACT_TYPE;
  readonly name = 'HubSpot: Update Contact';
  readonly description = 'Update properties on an existing HubSpot contact';
  readonly requiredConnectionType = 'hubspot';

  constructor(private readonly client: HubspotClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<HubspotOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = hubspotUpdateContactConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveUpdated: { contactId: params.contactId } },
        metadata: { mocked: true },
      };
    }

    const response = await this.client.call<HubspotContactResponse>(
      connection,
      `/crm/v3/objects/contacts/${encodeURIComponent(params.contactId)}`,
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
