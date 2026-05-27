import { Injectable } from '@nestjs/common';
import {
  BasePollTrigger,
  type DecryptedConnection,
  type PollContext,
  type PollResult,
} from '@tietide/sdk';
import type { NotionOAuth2Config } from '@tietide/shared';
import { NotionClientFactory } from '../../connectors/notion/notion-client.factory';

export const NOTION_DATABASE_ITEM_UPDATED_TYPE = 'notion-database-item-updated';

interface NotionQueryResponse {
  results?: Array<{ id?: string; last_edited_time?: string }>;
}

@Injectable()
export class NotionDatabaseItemUpdatedTrigger extends BasePollTrigger {
  readonly type = NOTION_DATABASE_ITEM_UPDATED_TYPE;
  readonly name = 'Notion: Database Item Updated';
  readonly description =
    'Fires when a Notion database item is edited (poll, last_edited_time cursor)';
  readonly requiredConnectionType = 'notion';
  readonly defaultIntervalSeconds = 300;

  constructor(private readonly client: NotionClientFactory) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const cfg = ctx.config as { databaseId?: string };
    if (typeof cfg.databaseId !== 'string' || cfg.databaseId.length === 0) {
      throw new Error('notion-database-item-updated requires config.databaseId');
    }

    // First tick: record "now" as the watermark and replay nothing.
    if (ctx.cursor === null) {
      return { items: [], newCursor: new Date().toISOString() };
    }

    const connection = ctx.connection as DecryptedConnection<NotionOAuth2Config>;
    const response = await this.client.call<NotionQueryResponse>(
      connection,
      `/v1/databases/${encodeURIComponent(cfg.databaseId)}/query`,
      {
        method: 'POST',
        body: JSON.stringify({
          sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
          page_size: 50,
        }),
      },
    );

    const results = response.data.results ?? [];
    const fresh = results.filter(
      (r) => typeof r.last_edited_time === 'string' && r.last_edited_time > ctx.cursor!,
    );
    const newCursor = fresh.reduce(
      (max, r) => (r.last_edited_time! > max ? r.last_edited_time! : max),
      ctx.cursor,
    );

    const items = fresh.map((r) => ({
      id: r.id ?? null,
      lastEditedTime: r.last_edited_time,
      databaseId: cfg.databaseId,
      page: r,
    }));

    return { items, newCursor };
  }
}
