import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { notionUpdatePageConfigSchema, type NotionOAuth2Config } from '@tietide/shared';
import { NotionClientFactory } from './notion-client.factory';

export const NOTION_UPDATE_PAGE_TYPE = 'notion-update-page';

interface NotionPageResponse {
  id?: string;
  url?: string;
  archived?: boolean;
  last_edited_time?: string;
}

@Injectable()
export class NotionUpdatePageAction extends BaseConnectorAction<NotionOAuth2Config> {
  readonly type = NOTION_UPDATE_PAGE_TYPE;
  readonly name = 'Notion: Update Page';
  readonly description = 'Update a Notion page’s properties or archive/restore it';
  readonly requiredConnectionType = 'notion';

  constructor(private readonly client: NotionClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<NotionOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = notionUpdatePageConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveUpdated: {
            pageId: params.pageId,
            propertyKeys: params.properties ? Object.keys(params.properties) : [],
            archived: params.archived ?? null,
          },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = {};
    if (params.properties) payload.properties = params.properties;
    if (params.archived !== undefined) payload.archived = params.archived;

    const response = await this.client.call<NotionPageResponse>(
      connection,
      `/v1/pages/${encodeURIComponent(params.pageId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
    );

    return {
      data: {
        id: response.data.id ?? params.pageId,
        url: response.data.url ?? null,
        archived: response.data.archived === true,
        lastEditedTime: response.data.last_edited_time ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
