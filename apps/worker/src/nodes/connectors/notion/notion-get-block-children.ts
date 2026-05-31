import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { notionGetBlockChildrenConfigSchema, type NotionOAuth2Config } from '@tietide/shared';
import { NotionClientFactory } from './notion-client.factory';

export const NOTION_GET_BLOCK_CHILDREN_TYPE = 'notion-get-block-children';

interface NotionBlockChildrenResponse {
  results?: Array<Record<string, unknown>>;
  next_cursor?: string | null;
  has_more?: boolean;
}

@Injectable()
export class NotionGetBlockChildrenAction extends BaseConnectorAction<NotionOAuth2Config> {
  readonly type = NOTION_GET_BLOCK_CHILDREN_TYPE;
  readonly name = 'Notion: Get Block Children';
  readonly description = 'Read the content blocks of a Notion page or block (paginated)';
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
    const params = notionGetBlockChildrenConfigSchema.parse(input.params);

    // NotionClientFactory.call has no query option, so encode the cursor/page
    // size into the path. URLSearchParams escapes the values for us.
    const search = new URLSearchParams();
    if (params.pageSize !== undefined) search.set('page_size', String(params.pageSize));
    if (params.startCursor) search.set('start_cursor', params.startCursor);
    const qs = search.toString();
    const path = `/v1/blocks/${encodeURIComponent(params.blockId)}/children${qs ? `?${qs}` : ''}`;

    const response = await this.client.call<NotionBlockChildrenResponse>(connection, path, {
      method: 'GET',
    });

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
