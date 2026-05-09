import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { airtableUpdateRecordConfigSchema, type AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableClientFactory } from './airtable-client.factory';

export const AIRTABLE_UPDATE_RECORD_TYPE = 'airtable-update-record';

interface AirtableSingleRecordResponse {
  id?: string;
  fields?: Record<string, unknown>;
  createdTime?: string;
}

@Injectable()
export class AirtableUpdateRecordAction extends BaseConnectorAction<AirtableApiKeyConfig> {
  readonly type = AIRTABLE_UPDATE_RECORD_TYPE;
  readonly name = 'Airtable: Update Record';
  readonly description = 'Patch fields on an existing Airtable record';
  readonly requiredConnectionType = 'airtable';

  constructor(private readonly client: AirtableClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<AirtableApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = airtableUpdateRecordConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveUpdated: {
            baseId: params.baseId,
            recordId: params.recordId,
            fieldKeys: Object.keys(params.fields),
          },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = { fields: params.fields };
    if (params.typecast) payload.typecast = true;

    const path = `/v0/${encodeURIComponent(params.baseId)}/${encodeURIComponent(
      params.tableIdOrName,
    )}/${encodeURIComponent(params.recordId)}`;

    // PATCH preserves untouched fields; PUT would clear them.
    const response = await this.client.call<AirtableSingleRecordResponse>(connection, path, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    return {
      data: {
        id: response.data.id ?? params.recordId,
        fields: response.data.fields ?? params.fields,
      },
      metadata: { statusCode: response.status },
    };
  }
}
