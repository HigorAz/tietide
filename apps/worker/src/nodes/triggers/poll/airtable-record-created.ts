import { Injectable } from '@nestjs/common';
import {
  BasePollTrigger,
  type DecryptedConnection,
  type PollContext,
  type PollResult,
} from '@tietide/sdk';
import type { AirtableApiKeyConfig } from '@tietide/shared';
import { AirtableClientFactory } from '../../connectors/airtable/airtable-client.factory';

export const AIRTABLE_RECORD_CREATED_TYPE = 'airtable-record-created';

interface AirtableListResponse {
  records?: Array<{ id?: string; fields?: Record<string, unknown>; createdTime?: string }>;
}

@Injectable()
export class AirtableRecordCreatedTrigger extends BasePollTrigger {
  readonly type = AIRTABLE_RECORD_CREATED_TYPE;
  readonly name = 'Airtable: Record Created';
  readonly description =
    'Fires when a new record is added to an Airtable table (poll, createdTime)';
  readonly requiredConnectionType = 'airtable';
  readonly defaultIntervalSeconds = 300;

  constructor(private readonly client: AirtableClientFactory) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const cfg = ctx.config as { baseId?: string; tableIdOrName?: string };
    if (typeof cfg.baseId !== 'string' || cfg.baseId.length === 0) {
      throw new Error('airtable-record-created requires config.baseId');
    }
    if (typeof cfg.tableIdOrName !== 'string' || cfg.tableIdOrName.length === 0) {
      throw new Error('airtable-record-created requires config.tableIdOrName');
    }

    // First tick: record "now" as the watermark and replay nothing.
    if (ctx.cursor === null) {
      return { items: [], newCursor: new Date().toISOString() };
    }

    const connection = ctx.connection as DecryptedConnection<AirtableApiKeyConfig>;
    const path = `/v0/${encodeURIComponent(cfg.baseId)}/${encodeURIComponent(cfg.tableIdOrName)}`;
    const response = await this.client.call<AirtableListResponse>(connection, path, {
      method: 'GET',
      // CREATED_TIME() compared against the cursor isolates records created since
      // the last tick — the API does the filtering, so every row returned is new.
      query: { filterByFormula: `IS_AFTER(CREATED_TIME(), '${ctx.cursor}')`, maxRecords: 100 },
    });

    const records = response.data.records ?? [];
    const newCursor = records.reduce(
      (max, r) => (typeof r.createdTime === 'string' && r.createdTime > max ? r.createdTime : max),
      ctx.cursor,
    );

    const items = records.map((r) => ({
      id: r.id ?? null,
      fields: r.fields ?? {},
      createdTime: r.createdTime ?? null,
      baseId: cfg.baseId,
      tableIdOrName: cfg.tableIdOrName,
    }));

    return { items, newCursor };
  }
}
