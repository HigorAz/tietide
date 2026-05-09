import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { trelloMoveCardConfigSchema, type TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloClientFactory } from './trello-client.factory';

export const TRELLO_MOVE_CARD_TYPE = 'trello-move-card';

interface TrelloUpdateCardResponse {
  id?: string;
  idList?: string;
  idBoard?: string;
  shortUrl?: string;
}

@Injectable()
export class TrelloMoveCardAction extends BaseConnectorAction<TrelloApiKeyConfig> {
  readonly type = TRELLO_MOVE_CARD_TYPE;
  readonly name = 'Trello: Move Card';
  readonly description = 'Move an existing Trello card to a different list';
  readonly requiredConnectionType = 'trello';

  constructor(private readonly client: TrelloClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TrelloApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = trelloMoveCardConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveMoved: { cardId: params.cardId, targetListId: params.targetListId },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = { idList: params.targetListId };
    if (params.pos !== undefined) payload.pos = params.pos;

    const response = await this.client.call<TrelloUpdateCardResponse>(
      connection,
      `/1/cards/${encodeURIComponent(params.cardId)}`,
      { method: 'PUT', body: JSON.stringify(payload) },
    );

    return {
      data: {
        id: response.data.id ?? params.cardId,
        listId: response.data.idList ?? params.targetListId,
        boardId: response.data.idBoard ?? null,
        url: response.data.shortUrl ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
