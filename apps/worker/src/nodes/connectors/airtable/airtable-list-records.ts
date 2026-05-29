import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { airtableListRecordsConfigSchema, type AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableClientFactory } from './airtable-client.factory';

export const AIRTABLE_LIST_RECORDS_TYPE = 'airtable-list-records';

interface AirtableListResponse {
  records?: Array<{ id?: string; fields?: Record<string, unknown>; createdTime?: string }>;
  offset?: string;
}

@Injectable()
export class AirtableListRecordsAction extends BaseConnectorAction<AirtableApiKeyConfig> {
  readonly type = AIRTABLE_LIST_RECORDS_TYPE;
  readonly name = 'Airtable: List Records';
  readonly description = 'List records from an Airtable table with optional filterByFormula';
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
    const params = airtableListRecordsConfigSchema.parse(input.params);

    const query: Record<string, string | number | string[] | undefined> = {};
    if (params.filterByFormula) query.filterByFormula = params.filterByFormula;
    if (params.maxRecords !== undefined) query.maxRecords = params.maxRecords;
    if (params.pageSize !== undefined) query.pageSize = params.pageSize;
    if (params.view) query.view = params.view;
    if (params.fields && params.fields.length > 0) query.fields = params.fields;
    if (params.offset) query.offset = params.offset;

    const path = `/v0/${encodeURIComponent(params.baseId)}/${encodeURIComponent(
      params.tableIdOrName,
    )}`;

    const response = await this.client.call<AirtableListResponse>(connection, path, {
      method: 'GET',
      query,
    });

    return {
      data: {
        records: response.data.records ?? [],
        offset: response.data.offset ?? null,
        count: response.data.records?.length ?? 0,
      },
      metadata: { statusCode: response.status },
    };
  }
}
