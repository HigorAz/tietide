import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { hubspotCreateNoteConfigSchema, type HubspotOAuth2Config } from '@tietide/shared';
import { HubspotClientFactory } from './hubspot-client.factory';

export const HUBSPOT_CREATE_NOTE_TYPE = 'hubspot-create-note';

// HubSpot default association type IDs (HUBSPOT_DEFINED):
// note → contact = 202, note → deal = 214.
const NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID = 202;
const NOTE_TO_DEAL_ASSOCIATION_TYPE_ID = 214;

interface HubspotNoteResponse {
  id?: string;
  properties?: Record<string, unknown>;
  createdAt?: string;
}

@Injectable()
export class HubspotCreateNoteAction extends BaseConnectorAction<HubspotOAuth2Config> {
  readonly type = HUBSPOT_CREATE_NOTE_TYPE;
  readonly name = 'HubSpot: Create Note';
  readonly description = 'Create a note, optionally associated with a contact or deal';
  readonly requiredConnectionType = 'hubspot';

  constructor(private readonly client: HubspotClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<HubspotOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = hubspotCreateNoteConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: { contactId: params.contactId ?? null, dealId: params.dealId ?? null },
        },
        metadata: { mocked: true },
      };
    }

    const associations: Array<Record<string, unknown>> = [];
    if (params.contactId) {
      associations.push({
        to: { id: params.contactId },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID,
          },
        ],
      });
    }
    if (params.dealId) {
      associations.push({
        to: { id: params.dealId },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: NOTE_TO_DEAL_ASSOCIATION_TYPE_ID,
          },
        ],
      });
    }

    const payload: Record<string, unknown> = {
      properties: { hs_note_body: params.body, hs_timestamp: new Date().toISOString() },
    };
    if (associations.length > 0) payload.associations = associations;

    const response = await this.client.call<HubspotNoteResponse>(
      connection,
      '/crm/v3/objects/notes',
      { method: 'POST', body: JSON.stringify(payload) },
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
