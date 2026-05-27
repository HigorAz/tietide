import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { notionGetPageConfigSchema, type NotionOAuth2Config } from '@tietide/shared';
import { NotionClientFactory } from './notion-client.factory';

export const NOTION_GET_PAGE_TYPE = 'notion-get-page';

interface NotionPageResponse {
  id?: string;
  url?: string;
  properties?: Record<string, unknown>;
  parent?: { database_id?: string; page_id?: string };
  archived?: boolean;
  created_time?: string;
  last_edited_time?: string;
}

@Injectable()
export class NotionGetPageAction extends BaseConnectorAction<NotionOAuth2Config> {
  readonly type = NOTION_GET_PAGE_TYPE;
  readonly name = 'Notion: Get Page';
  readonly description = 'Retrieve a Notion page and its properties by ID';
  readonly requiredConnectionType = 'notion';

  constructor(private readonly client: NotionClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<NotionOAuth2Config>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = notionGetPageConfigSchema.parse(input.params);

    const response = await this.client.call<NotionPageResponse>(
      connection,
      `/v1/pages/${encodeURIComponent(params.pageId)}`,
      { method: 'GET' },
    );

    return {
      data: {
        id: response.data.id ?? params.pageId,
        url: response.data.url ?? null,
        properties: response.data.properties ?? {},
        archived: response.data.archived === true,
        createdTime: response.data.created_time ?? null,
        lastEditedTime: response.data.last_edited_time ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
