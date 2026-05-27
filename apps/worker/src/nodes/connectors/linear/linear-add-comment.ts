import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { linearAddCommentConfigSchema, type LinearApiKeyConfig } from '@tietide/shared';
import { LinearClientFactory } from './linear-client.factory';

export const LINEAR_ADD_COMMENT_TYPE = 'linear-add-comment';

const COMMENT_CREATE_MUTATION = `
  mutation CommentCreate($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment { id url }
    }
  }
`;

interface CommentCreateData {
  commentCreate?: {
    success?: boolean;
    comment?: { id?: string; url?: string };
  };
}

@Injectable()
export class LinearAddCommentAction extends BaseConnectorAction<LinearApiKeyConfig> {
  readonly type = LINEAR_ADD_COMMENT_TYPE;
  readonly name = 'Linear: Add Comment';
  readonly description = 'Add a comment to a Linear issue';
  readonly requiredConnectionType = 'linear';

  constructor(private readonly client: LinearClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<LinearApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = linearAddCommentConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveCommented: { issueId: params.issueId } },
        metadata: { mocked: true },
      };
    }

    const response = await this.client.query<CommentCreateData>(
      connection,
      COMMENT_CREATE_MUTATION,
      {
        input: { issueId: params.issueId, body: params.body },
      },
    );

    const created = response.data?.commentCreate;
    return {
      data: {
        success: created?.success === true,
        id: created?.comment?.id ?? null,
        url: created?.comment?.url ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
