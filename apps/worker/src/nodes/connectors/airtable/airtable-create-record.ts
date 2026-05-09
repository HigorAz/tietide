import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { airtableCreateRecordConfigSchema, type AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableClientFactory } from './airtable-client.factory';

export const AIRTABLE_CREATE_RECORD_TYPE = 'airtable-create-record';

interface AirtableSingleRecordResponse {
  id?: string;
  fields?: Record<string, unknown>;
  createdTime?: string;
}

@Injectable()
export class AirtableCreateRecordAction extends BaseConnectorAction<AirtableApiKeyConfig> {
  readonly type = AIRTABLE_CREATE_RECORD_TYPE;
  readonly name = 'Airtable: Create Record';
  readonly description = 'Create a record in an Airtable table';
  readonly requiredConnectionType = 'airtable';

  constructor(private readonly client: AirtableClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<AirtableApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = airtableCreateRecordConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: {
            baseId: params.baseId,
            tableIdOrName: params.tableIdOrName,
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
    )}`;

    const response = await this.client.call<AirtableSingleRecordResponse>(connection, path, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      data: {
        id: response.data.id ?? null,
        fields: response.data.fields ?? params.fields,
        createdTime: response.data.createdTime ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
