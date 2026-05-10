import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { trelloUpdateCardConfigSchema, type TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloClientFactory } from './trello-client.factory';

export const TRELLO_UPDATE_CARD_TYPE = 'trello-update-card';

interface TrelloCardResponse {
  id?: string;
  name?: string;
  desc?: string;
  due?: string | null;
  closed?: boolean;
  idList?: string;
  url?: string;
}

@Injectable()
export class TrelloUpdateCardAction extends BaseConnectorAction<TrelloApiKeyConfig> {
  readonly type = TRELLO_UPDATE_CARD_TYPE;
  readonly name = 'Trello: Update Card';
  readonly description =
    'Update fields (name, description, due, list, archived) on an existing Trello card';
  readonly requiredConnectionType = 'trello';

  constructor(private readonly client: TrelloClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TrelloApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = trelloUpdateCardConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveUpdated: { cardId: params.cardId } },
        metadata: { mocked: true },
      };
    }

    const query: Record<string, string | number | boolean | undefined> = {};
    if (params.name !== undefined) query.name = params.name;
    if (params.desc !== undefined) query.desc = params.desc;
    if (params.due !== undefined) query.due = params.due === null ? '' : params.due;
    if (params.closed !== undefined) query.closed = params.closed;
    if (params.idList !== undefined) query.idList = params.idList;

    const response = await this.client.call<TrelloCardResponse>(
      connection,
      `/1/cards/${params.cardId}`,
      {
        method: 'PUT',
        query,
      },
    );

    return {
      data: {
        id: response.data.id ?? params.cardId,
        name: response.data.name ?? null,
        desc: response.data.desc ?? null,
        due: response.data.due ?? null,
        closed: response.data.closed ?? null,
        idList: response.data.idList ?? null,
        url: response.data.url ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
