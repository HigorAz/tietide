import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { linearUpdateIssueStatusConfigSchema, type LinearApiKeyConfig } from '@tietide/shared';
import { LinearClientFactory } from './linear-client.factory';

export const LINEAR_UPDATE_ISSUE_STATUS_TYPE = 'linear-update-issue-status';

const ISSUE_UPDATE_MUTATION = `
  mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue {
        id
        identifier
        url
        state { id name }
      }
    }
  }
`;

interface IssueUpdateData {
  issueUpdate?: {
    success?: boolean;
    issue?: {
      id?: string;
      identifier?: string;
      url?: string;
      state?: { id?: string; name?: string };
    };
  };
}

@Injectable()
export class LinearUpdateIssueStatusAction extends BaseConnectorAction<LinearApiKeyConfig> {
  readonly type = LINEAR_UPDATE_ISSUE_STATUS_TYPE;
  readonly name = 'Linear: Update Issue Status';
  readonly description = 'Move a Linear issue to a different workflow state';
  readonly requiredConnectionType = 'linear';

  constructor(private readonly client: LinearClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<LinearApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = linearUpdateIssueStatusConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveUpdated: { issueId: params.issueId, stateId: params.stateId },
        },
        metadata: { mocked: true },
      };
    }

    const response = await this.client.query<IssueUpdateData>(connection, ISSUE_UPDATE_MUTATION, {
      id: params.issueId,
      input: { stateId: params.stateId },
    });

    const issue = response.data?.issueUpdate?.issue;
    return {
      data: {
        success: response.data?.issueUpdate?.success === true,
        id: issue?.id ?? params.issueId,
        identifier: issue?.identifier ?? null,
        url: issue?.url ?? null,
        stateId: issue?.state?.id ?? params.stateId,
        stateName: issue?.state?.name ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
