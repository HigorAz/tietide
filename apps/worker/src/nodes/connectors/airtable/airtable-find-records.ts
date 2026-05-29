import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { airtableFindRecordsConfigSchema, type AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableClientFactory } from './airtable-client.factory';

export const AIRTABLE_FIND_RECORDS_TYPE = 'airtable-find-records';

interface AirtableListResponse {
  records?: Array<{ id?: string; fields?: Record<string, unknown>; createdTime?: string }>;
}

@Injectable()
export class AirtableFindRecordsAction extends BaseConnectorAction<AirtableApiKeyConfig> {
  readonly type = AIRTABLE_FIND_RECORDS_TYPE;
  readonly name = 'Airtable: Find Records';
  readonly description = 'Find Airtable records matching a filterByFormula expression';
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
    const params = airtableFindRecordsConfigSchema.parse(input.params);

    const query: Record<string, string | number | string[] | undefined> = {
      filterByFormula: params.filterByFormula,
    };
    if (params.maxRecords !== undefined) query.maxRecords = params.maxRecords;
    if (params.view) query.view = params.view;
    if (params.fields && params.fields.length > 0) query.fields = params.fields;

    const path = `/v0/${encodeURIComponent(params.baseId)}/${encodeURIComponent(
      params.tableIdOrName,
    )}`;

    const response = await this.client.call<AirtableListResponse>(connection, path, {
      method: 'GET',
      query,
    });

    const records = response.data.records ?? [];
    return {
      data: {
        records,
        count: records.length,
        found: records.length > 0,
        first: records[0] ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
