import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { notionQueryDatabaseConfigSchema, type NotionOAuth2Config } from '@tietide/shared';
import { NotionClientFactory } from './notion-client.factory';

export const NOTION_QUERY_DATABASE_TYPE = 'notion-query-database';

interface NotionQueryDatabaseResponse {
  results?: Array<Record<string, unknown>>;
  next_cursor?: string | null;
  has_more?: boolean;
}

@Injectable()
export class NotionQueryDatabaseAction extends BaseConnectorAction<NotionOAuth2Config> {
  readonly type = NOTION_QUERY_DATABASE_TYPE;
  readonly name = 'Notion: Query Database';
  readonly description = 'Query rows from a Notion database with filter/sort';
  readonly requiredConnectionType = 'notion';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: NotionClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<NotionOAuth2Config>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = notionQueryDatabaseConfigSchema.parse(input.params);

    const payload: Record<string, unknown> = {};
    if (params.filter) payload.filter = params.filter;
    if (params.sorts) payload.sorts = params.sorts;
    if (params.pageSize !== undefined) payload.page_size = params.pageSize;
    if (params.startCursor) payload.start_cursor = params.startCursor;

    const response = await this.client.call<NotionQueryDatabaseResponse>(
      connection,
      `/v1/databases/${encodeURIComponent(params.databaseId)}/query`,
      { method: 'POST', body: JSON.stringify(payload) },
    );

    return {
      data: {
        results: response.data.results ?? [],
        nextCursor: response.data.next_cursor ?? null,
        hasMore: response.data.has_more === true,
        count: response.data.results?.length ?? 0,
      },
      metadata: { statusCode: response.status },
    };
  }
}
