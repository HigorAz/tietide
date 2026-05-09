import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { notionCreatePageConfigSchema, type NotionOAuth2Config } from '@tietide/shared';
import { NotionClientFactory } from './notion-client.factory';

export const NOTION_CREATE_PAGE_TYPE = 'notion-create-page';

interface NotionCreatePageResponse {
  id?: string;
  url?: string;
  parent?: { database_id?: string; page_id?: string };
  created_time?: string;
}

@Injectable()
export class NotionCreatePageAction extends BaseConnectorAction<NotionOAuth2Config> {
  readonly type = NOTION_CREATE_PAGE_TYPE;
  readonly name = 'Notion: Create Page';
  readonly description = 'Create a new page under a parent page or database';
  readonly requiredConnectionType = 'notion';

  constructor(private readonly client: NotionClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<NotionOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = notionCreatePageConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: {
            parentDatabaseId: params.parentDatabaseId,
            propertyKeys: Object.keys(params.properties),
            childCount: params.children?.length ?? 0,
          },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = {
      parent: { database_id: params.parentDatabaseId },
      properties: params.properties,
    };
    if (params.children) payload.children = params.children;

    const response = await this.client.call<NotionCreatePageResponse>(connection, '/v1/pages', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      data: {
        id: response.data.id ?? null,
        url: response.data.url ?? null,
        parentDatabaseId: response.data.parent?.database_id ?? params.parentDatabaseId,
        createdTime: response.data.created_time ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
