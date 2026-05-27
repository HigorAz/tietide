import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { hubspotCreateCompanyConfigSchema, type HubspotOAuth2Config } from '@tietide/shared';
import { HubspotClientFactory } from './hubspot-client.factory';

export const HUBSPOT_CREATE_COMPANY_TYPE = 'hubspot-create-company';

interface HubspotCompanyResponse {
  id?: string;
  properties?: Record<string, unknown>;
  createdAt?: string;
}

@Injectable()
export class HubspotCreateCompanyAction extends BaseConnectorAction<HubspotOAuth2Config> {
  readonly type = HUBSPOT_CREATE_COMPANY_TYPE;
  readonly name = 'HubSpot: Create Company';
  readonly description = 'Create a company in HubSpot CRM';
  readonly requiredConnectionType = 'hubspot';

  constructor(private readonly client: HubspotClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<HubspotOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = hubspotCreateCompanyConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveCreated: { name: params.name } },
        metadata: { mocked: true },
      };
    }

    const properties: Record<string, unknown> = {
      name: params.name,
      ...(params.domain ? { domain: params.domain } : {}),
      ...(params.properties ?? {}),
    };

    const response = await this.client.call<HubspotCompanyResponse>(
      connection,
      '/crm/v3/objects/companies',
      { method: 'POST', body: JSON.stringify({ properties }) },
    );

    return {
      data: {
        id: response.data.id ?? null,
        properties: response.data.properties ?? null,
        createdAt: response.data.createdAt ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
