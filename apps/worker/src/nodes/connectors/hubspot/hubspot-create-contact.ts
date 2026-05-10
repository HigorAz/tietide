import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { hubspotCreateContactConfigSchema, type HubspotOAuth2Config } from '@tietide/shared';
import { HubspotClientFactory } from './hubspot-client.factory';

export const HUBSPOT_CREATE_CONTACT_TYPE = 'hubspot-create-contact';

interface HubspotContactResponse {
  id?: string;
  properties?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class HubspotCreateContactAction extends BaseConnectorAction<HubspotOAuth2Config> {
  readonly type = HUBSPOT_CREATE_CONTACT_TYPE;
  readonly name = 'HubSpot: Create Contact';
  readonly description = 'Create a contact in HubSpot CRM';
  readonly requiredConnectionType = 'hubspot';

  constructor(private readonly client: HubspotClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<HubspotOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = hubspotCreateContactConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: { email: params.email },
        },
        metadata: { mocked: true },
      };
    }

    const properties: Record<string, unknown> = {
      email: params.email,
      ...(params.firstName ? { firstname: params.firstName } : {}),
      ...(params.lastName ? { lastname: params.lastName } : {}),
      ...(params.properties ?? {}),
    };

    const response = await this.client.call<HubspotContactResponse>(
      connection,
      '/crm/v3/objects/contacts',
      {
        method: 'POST',
        body: JSON.stringify({ properties }),
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
