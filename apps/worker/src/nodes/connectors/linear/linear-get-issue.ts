import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { linearGetIssueConfigSchema, type LinearApiKeyConfig } from '@tietide/shared';
import { LinearClientFactory } from './linear-client.factory';

export const LINEAR_GET_ISSUE_TYPE = 'linear-get-issue';

const ISSUE_QUERY = `
  query Issue($id: String!) {
    issue(id: $id) {
      id
      identifier
      title
      url
      state { id name }
      assignee { id name }
    }
  }
`;

interface IssueData {
  issue?: {
    id?: string;
    identifier?: string;
    title?: string;
    url?: string;
    state?: { id?: string; name?: string };
    assignee?: { id?: string; name?: string } | null;
  } | null;
}

@Injectable()
export class LinearGetIssueAction extends BaseConnectorAction<LinearApiKeyConfig> {
  readonly type = LINEAR_GET_ISSUE_TYPE;
  readonly name = 'Linear: Get Issue';
  readonly description = 'Fetch a Linear issue by ID';
  readonly requiredConnectionType = 'linear';

  constructor(private readonly client: LinearClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<LinearApiKeyConfig>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = linearGetIssueConfigSchema.parse(input.params);

    const response = await this.client.query<IssueData>(connection, ISSUE_QUERY, {
      id: params.issueId,
    });

    const issue = response.data?.issue ?? null;
    return {
      data: {
        found: issue !== null,
        id: issue?.id ?? null,
        identifier: issue?.identifier ?? null,
        title: issue?.title ?? null,
        url: issue?.url ?? null,
        state: issue?.state ?? null,
        assignee: issue?.assignee ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
