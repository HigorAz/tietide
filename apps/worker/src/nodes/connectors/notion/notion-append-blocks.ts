import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { notionAppendBlocksConfigSchema, type NotionOAuth2Config } from '@tietide/shared';
import { NotionClientFactory } from './notion-client.factory';

export const NOTION_APPEND_BLOCKS_TYPE = 'notion-append-blocks';

interface NotionAppendResponse {
  results?: Array<Record<string, unknown>>;
  next_cursor?: string | null;
  has_more?: boolean;
}

@Injectable()
export class NotionAppendBlocksAction extends BaseConnectorAction<NotionOAuth2Config> {
  readonly type = NOTION_APPEND_BLOCKS_TYPE;
  readonly name = 'Notion: Append Blocks';
  readonly description = 'Append content blocks to a Notion page or block';
  readonly requiredConnectionType = 'notion';

  constructor(private readonly client: NotionClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<NotionOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = notionAppendBlocksConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveAppended: { blockId: params.blockId, childCount: params.children.length },
        },
        metadata: { mocked: true },
      };
    }

    const response = await this.client.call<NotionAppendResponse>(
      connection,
      `/v1/blocks/${encodeURIComponent(params.blockId)}/children`,
      { method: 'PATCH', body: JSON.stringify({ children: params.children }) },
    );

    return {
      data: {
        results: response.data.results ?? [],
        count: response.data.results?.length ?? 0,
      },
      metadata: { statusCode: response.status },
    };
  }
}
