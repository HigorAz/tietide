import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { trelloAddCommentConfigSchema, type TrelloApiKeyConfig } from '@tietide/shared';
import { TrelloClientFactory } from './trello-client.factory';

export const TRELLO_ADD_COMMENT_TYPE = 'trello-add-comment';

interface TrelloCommentResponse {
  id?: string;
  data?: { text?: string; card?: { id?: string } };
  date?: string;
}

@Injectable()
export class TrelloAddCommentAction extends BaseConnectorAction<TrelloApiKeyConfig> {
  readonly type = TRELLO_ADD_COMMENT_TYPE;
  readonly name = 'Trello: Add Comment';
  readonly description = 'Post a comment on an existing Trello card';
  readonly requiredConnectionType = 'trello';

  constructor(private readonly client: TrelloClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<TrelloApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = trelloAddCommentConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveCommented: { cardId: params.cardId } },
        metadata: { mocked: true },
      };
    }

    const response = await this.client.call<TrelloCommentResponse>(
      connection,
      `/1/cards/${params.cardId}/actions/comments`,
      {
        method: 'POST',
        query: { text: params.text },
      },
    );

    return {
      data: {
        id: response.data.id ?? null,
        cardId: response.data.data?.card?.id ?? params.cardId,
        text: response.data.data?.text ?? params.text,
        date: response.data.date ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
