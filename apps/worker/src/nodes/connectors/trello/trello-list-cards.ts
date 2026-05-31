import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { trelloListCardsConfigSchema, type TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloClientFactory } from './trello-client.factory';

export const TRELLO_LIST_CARDS_TYPE = 'trello-list-cards';

type TrelloCardSummary = Record<string, unknown>;

@Injectable()
export class TrelloListCardsAction extends BaseConnectorAction<TrelloApiKeyConfig> {
  readonly type = TRELLO_LIST_CARDS_TYPE;
  readonly name = 'Trello: List Cards';
  readonly description = 'List cards on a Trello board or list';
  readonly requiredConnectionType = 'trello';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: TrelloClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TrelloApiKeyConfig>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = trelloListCardsConfigSchema.parse(input.params);

    const collection = params.source === 'board' ? 'boards' : 'lists';
    const path = `/1/${collection}/${encodeURIComponent(params.containerId)}/cards`;

    const response = await this.client.call<TrelloCardSummary[]>(connection, path, {
      method: 'GET',
    });

    const cards = Array.isArray(response.data) ? response.data : [];
    return {
      data: { cards, count: cards.length },
      metadata: { statusCode: response.status },
    };
  }
}
