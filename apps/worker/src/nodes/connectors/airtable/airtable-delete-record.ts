import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { airtableDeleteRecordConfigSchema, type AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableClientFactory } from './airtable-client.factory';

export const AIRTABLE_DELETE_RECORD_TYPE = 'airtable-delete-record';

interface AirtableDeleteResponse {
  id?: string;
  deleted?: boolean;
}

@Injectable()
export class AirtableDeleteRecordAction extends BaseConnectorAction<AirtableApiKeyConfig> {
  readonly type = AIRTABLE_DELETE_RECORD_TYPE;
  readonly name = 'Airtable: Delete Record';
  readonly description = 'Delete a single Airtable record by ID';
  readonly requiredConnectionType = 'airtable';

  constructor(private readonly client: AirtableClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<AirtableApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = airtableDeleteRecordConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveDeleted: { recordId: params.recordId } },
        metadata: { mocked: true },
      };
    }

    const path = `/v0/${encodeURIComponent(params.baseId)}/${encodeURIComponent(
      params.tableIdOrName,
    )}/${encodeURIComponent(params.recordId)}`;

    const response = await this.client.call<AirtableDeleteResponse>(connection, path, {
      method: 'DELETE',
    });

    return {
      data: {
        id: response.data.id ?? params.recordId,
        deleted: response.data.deleted === true,
      },
      metadata: { statusCode: response.status },
    };
  }
}
