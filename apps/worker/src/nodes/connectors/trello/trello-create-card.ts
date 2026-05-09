import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { trelloCreateCardConfigSchema, type TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloClientFactory } from './trello-client.factory';

export const TRELLO_CREATE_CARD_TYPE = 'trello-create-card';

interface TrelloCreateCardResponse {
  id?: string;
  shortUrl?: string;
  url?: string;
  idList?: string;
  idBoard?: string;
}

@Injectable()
export class TrelloCreateCardAction extends BaseConnectorAction<TrelloApiKeyConfig> {
  readonly type = TRELLO_CREATE_CARD_TYPE;
  readonly name = 'Trello: Create Card';
  readonly description = 'Create a Trello card on a board list';
  readonly requiredConnectionType = 'trello';

  constructor(private readonly client: TrelloClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TrelloApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = trelloCreateCardConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: { listId: params.listId, name: params.name },
        },
        metadata: { mocked: true },
      };
    }

    // Trello accepts card creation via either query params or JSON body.
    // We send a JSON body and let the factory inject `key`/`token` into the URL.
    const payload: Record<string, unknown> = { idList: params.listId, name: params.name };
    if (params.desc !== undefined) payload.desc = params.desc;
    if (params.pos !== undefined) payload.pos = params.pos;
    if (params.due !== undefined) payload.due = params.due;
    if (params.idMembers && params.idMembers.length > 0) {
      payload.idMembers = params.idMembers.join(',');
    }
    if (params.idLabels && params.idLabels.length > 0) {
      payload.idLabels = params.idLabels.join(',');
    }

    const response = await this.client.call<TrelloCreateCardResponse>(connection, '/1/cards', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      data: {
        id: response.data.id ?? null,
        url: response.data.shortUrl ?? response.data.url ?? null,
        listId: response.data.idList ?? params.listId,
        boardId: response.data.idBoard ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
