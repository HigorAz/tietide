import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { airtableGetRecordConfigSchema, type AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableClientFactory } from './airtable-client.factory';

export const AIRTABLE_GET_RECORD_TYPE = 'airtable-get-record';

interface AirtableSingleRecordResponse {
  id?: string;
  fields?: Record<string, unknown>;
  createdTime?: string;
}

@Injectable()
export class AirtableGetRecordAction extends BaseConnectorAction<AirtableApiKeyConfig> {
  readonly type = AIRTABLE_GET_RECORD_TYPE;
  readonly name = 'Airtable: Get Record';
  readonly description = 'Fetch a single Airtable record by ID';
  readonly requiredConnectionType = 'airtable';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: AirtableClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<AirtableApiKeyConfig>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = airtableGetRecordConfigSchema.parse(input.params);

    const path = `/v0/${encodeURIComponent(params.baseId)}/${encodeURIComponent(
      params.tableIdOrName,
    )}/${encodeURIComponent(params.recordId)}`;

    const response = await this.client.call<AirtableSingleRecordResponse>(connection, path, {
      method: 'GET',
    });

    return {
      data: {
        id: response.data.id ?? params.recordId,
        fields: response.data.fields ?? {},
        createdTime: response.data.createdTime ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
