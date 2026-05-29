import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { linearSearchIssuesConfigSchema, type LinearApiKeyConfig } from '@tietide/shared';
import { LinearClientFactory } from './linear-client.factory';

export const LINEAR_SEARCH_ISSUES_TYPE = 'linear-search-issues';

const SEARCH_QUERY = `
  query SearchIssues($filter: IssueFilter, $first: Int) {
    issues(filter: $filter, first: $first) {
      nodes {
        id
        identifier
        title
        url
        state { id name }
      }
    }
  }
`;

interface SearchData {
  issues?: {
    nodes?: Array<Record<string, unknown>>;
  };
}

@Injectable()
export class LinearSearchIssuesAction extends BaseConnectorAction<LinearApiKeyConfig> {
  readonly type = LINEAR_SEARCH_ISSUES_TYPE;
  readonly name = 'Linear: Search Issues';
  readonly description = 'Search Linear issues by title text';
  readonly requiredConnectionType = 'linear';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: LinearClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<LinearApiKeyConfig>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = linearSearchIssuesConfigSchema.parse(input.params);

    const filter: Record<string, unknown> = { title: { containsIgnoreCase: params.term } };
    if (params.teamId) filter.team = { id: { eq: params.teamId } };

    const response = await this.client.query<SearchData>(connection, SEARCH_QUERY, {
      filter,
      first: params.first ?? 25,
    });

    const nodes = response.data?.issues?.nodes ?? [];
    return {
      data: { issues: nodes, count: nodes.length },
      metadata: { statusCode: response.status },
    };
  }
}
