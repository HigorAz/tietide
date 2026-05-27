import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { trelloCreateListConfigSchema, type TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloClientFactory } from './trello-client.factory';

export const TRELLO_CREATE_LIST_TYPE = 'trello-create-list';

interface TrelloListResponse {
  id?: string;
  name?: string;
  idBoard?: string;
  pos?: number;
}

@Injectable()
export class TrelloCreateListAction extends BaseConnectorAction<TrelloApiKeyConfig> {
  readonly type = TRELLO_CREATE_LIST_TYPE;
  readonly name = 'Trello: Create List';
  readonly description = 'Create a new list on a Trello board';
  readonly requiredConnectionType = 'trello';

  constructor(private readonly client: TrelloClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TrelloApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = trelloCreateListConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveCreated: { boardId: params.boardId, name: params.name } },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = { name: params.name, idBoard: params.boardId };
    if (params.pos !== undefined) payload.pos = params.pos;

    const response = await this.client.call<TrelloListResponse>(connection, '/1/lists', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      data: {
        id: response.data.id ?? null,
        name: response.data.name ?? params.name,
        boardId: response.data.idBoard ?? params.boardId,
        pos: response.data.pos ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
