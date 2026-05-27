import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { trelloGetCardConfigSchema, type TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloClientFactory } from './trello-client.factory';

export const TRELLO_GET_CARD_TYPE = 'trello-get-card';

interface TrelloCardResponse {
  id?: string;
  name?: string;
  desc?: string;
  shortUrl?: string;
  url?: string;
  idList?: string;
  idBoard?: string;
  closed?: boolean;
  due?: string | null;
}

@Injectable()
export class TrelloGetCardAction extends BaseConnectorAction<TrelloApiKeyConfig> {
  readonly type = TRELLO_GET_CARD_TYPE;
  readonly name = 'Trello: Get Card';
  readonly description = 'Fetch a Trello card by ID';
  readonly requiredConnectionType = 'trello';

  constructor(private readonly client: TrelloClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TrelloApiKeyConfig>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = trelloGetCardConfigSchema.parse(input.params);

    const response = await this.client.call<TrelloCardResponse>(
      connection,
      `/1/cards/${encodeURIComponent(params.cardId)}`,
      { method: 'GET' },
    );

    return {
      data: {
        id: response.data.id ?? params.cardId,
        name: response.data.name ?? null,
        desc: response.data.desc ?? null,
        url: response.data.shortUrl ?? response.data.url ?? null,
        listId: response.data.idList ?? null,
        boardId: response.data.idBoard ?? null,
        closed: response.data.closed === true,
        due: response.data.due ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
