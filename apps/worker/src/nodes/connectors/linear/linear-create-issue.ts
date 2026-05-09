import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { linearCreateIssueConfigSchema, type LinearApiKeyConfig } from '@tietide/shared';
import { LinearClientFactory } from './linear-client.factory';

export const LINEAR_CREATE_ISSUE_TYPE = 'linear-create-issue';

const ISSUE_CREATE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        url
        title
      }
    }
  }
`;

interface IssueCreateData {
  issueCreate?: {
    success?: boolean;
    issue?: { id?: string; identifier?: string; url?: string; title?: string };
  };
}

@Injectable()
export class LinearCreateIssueAction extends BaseConnectorAction<LinearApiKeyConfig> {
  readonly type = LINEAR_CREATE_ISSUE_TYPE;
  readonly name = 'Linear: Create Issue';
  readonly description = 'Create a Linear issue in a team';
  readonly requiredConnectionType = 'linear';

  constructor(private readonly client: LinearClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<LinearApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = linearCreateIssueConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveCreated: { teamId: params.teamId, title: params.title } },
        metadata: { mocked: true },
      };
    }

    const inputObj: Record<string, unknown> = {
      teamId: params.teamId,
      title: params.title,
    };
    if (params.description !== undefined) inputObj.description = params.description;
    if (params.assigneeId !== undefined) inputObj.assigneeId = params.assigneeId;
    if (params.stateId !== undefined) inputObj.stateId = params.stateId;
    if (params.priority !== undefined) inputObj.priority = params.priority;
    if (params.labelIds && params.labelIds.length > 0) inputObj.labelIds = params.labelIds;

    const response = await this.client.query<IssueCreateData>(connection, ISSUE_CREATE_MUTATION, {
      input: inputObj,
    });

    const issue = response.data?.issueCreate?.issue;
    return {
      data: {
        success: response.data?.issueCreate?.success === true,
        id: issue?.id ?? null,
        identifier: issue?.identifier ?? null,
        url: issue?.url ?? null,
        title: issue?.title ?? params.title,
      },
      metadata: { statusCode: response.status },
    };
  }
}
