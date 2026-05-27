import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { hubspotGetContactConfigSchema, type HubspotOAuth2Config } from '@tietide/shared';
import { HubspotClientFactory } from './hubspot-client.factory';

export const HUBSPOT_GET_CONTACT_TYPE = 'hubspot-get-contact';

interface HubspotContactResponse {
  id?: string;
  properties?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class HubspotGetContactAction extends BaseConnectorAction<HubspotOAuth2Config> {
  readonly type = HUBSPOT_GET_CONTACT_TYPE;
  readonly name = 'HubSpot: Get Contact';
  readonly description = 'Fetch a HubSpot contact by ID';
  readonly requiredConnectionType = 'hubspot';

  constructor(private readonly client: HubspotClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<HubspotOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = hubspotGetContactConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return { data: { mocked: true, contact: null }, metadata: { mocked: true } };
    }

    const response = await this.client.call<HubspotContactResponse>(
      connection,
      `/crm/v3/objects/contacts/${encodeURIComponent(params.contactId)}`,
      { method: 'GET' },
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
