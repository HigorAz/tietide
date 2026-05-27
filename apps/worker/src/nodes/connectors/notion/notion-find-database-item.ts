import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { notionFindDatabaseItemConfigSchema, type NotionOAuth2Config } from '@tietide/shared';
import { NotionClientFactory } from './notion-client.factory';

export const NOTION_FIND_DATABASE_ITEM_TYPE = 'notion-find-database-item';

interface NotionQueryResponse {
  results?: Array<Record<string, unknown> & { id?: string; url?: string }>;
}

@Injectable()
export class NotionFindDatabaseItemAction extends BaseConnectorAction<NotionOAuth2Config> {
  readonly type = NOTION_FIND_DATABASE_ITEM_TYPE;
  readonly name = 'Notion: Find Database Item';
  readonly description = 'Query a Notion database and return the first matching item';
  readonly requiredConnectionType = 'notion';

  constructor(private readonly client: NotionClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<NotionOAuth2Config>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = notionFindDatabaseItemConfigSchema.parse(input.params);

    const payload: Record<string, unknown> = { page_size: 1 };
    if (params.filter) payload.filter = params.filter;
    if (params.sorts) payload.sorts = params.sorts;

    const response = await this.client.call<NotionQueryResponse>(
      connection,
      `/v1/databases/${encodeURIComponent(params.databaseId)}/query`,
      { method: 'POST', body: JSON.stringify(payload) },
    );

    const item = response.data.results?.[0] ?? null;
    return {
      data: {
        found: item !== null,
        id: item?.id ?? null,
        item,
      },
      metadata: { statusCode: response.status },
    };
  }
}
