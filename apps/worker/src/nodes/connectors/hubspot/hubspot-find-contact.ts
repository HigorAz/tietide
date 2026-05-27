import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { hubspotFindContactConfigSchema, type HubspotOAuth2Config } from '@tietide/shared';
import { HubspotClientFactory } from './hubspot-client.factory';

export const HUBSPOT_FIND_CONTACT_TYPE = 'hubspot-find-contact';

interface HubspotSearchResponse {
  total?: number;
  results?: Array<Record<string, unknown>>;
}

@Injectable()
export class HubspotFindContactAction extends BaseConnectorAction<HubspotOAuth2Config> {
  readonly type = HUBSPOT_FIND_CONTACT_TYPE;
  readonly name = 'HubSpot: Find Contact';
  readonly description = 'Find a HubSpot contact by email address (search API)';
  readonly requiredConnectionType = 'hubspot';

  constructor(private readonly client: HubspotClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<HubspotOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = hubspotFindContactConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, found: false, contact: null, contacts: [] },
        metadata: { mocked: true },
      };
    }

    const body = JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: params.email }] }],
      limit: 1,
    });

    const response = await this.client.call<HubspotSearchResponse>(
      connection,
      '/crm/v3/objects/contacts/search',
      { method: 'POST', body },
    );

    const contacts = response.data.results ?? [];
    return {
      data: {
        found: contacts.length > 0,
        contact: contacts[0] ?? null,
        contacts,
        count: contacts.length,
      },
      metadata: { statusCode: response.status },
    };
  }
}
