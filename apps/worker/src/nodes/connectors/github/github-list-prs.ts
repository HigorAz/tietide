import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { githubListPrsConfigSchema, type GitHubOAuth2Config } from '@tietide/shared';
import { GitHubClientFactory } from './github-client.factory';

export const GITHUB_LIST_PRS_TYPE = 'github-list-prs';

type GitHubPullItem = Record<string, unknown>;

@Injectable()
export class GitHubListPrsAction extends BaseConnectorAction<GitHubOAuth2Config> {
  readonly type = GITHUB_LIST_PRS_TYPE;
  readonly name = 'GitHub: List Pull Requests';
  readonly description = 'List pull requests in a GitHub repository';
  readonly requiredConnectionType = 'github';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: GitHubClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GitHubOAuth2Config>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = githubListPrsConfigSchema.parse(input.params);

    const search = new URLSearchParams();
    if (params.state) search.set('state', params.state);
    if (params.perPage !== undefined) search.set('per_page', String(params.perPage));
    const qs = search.toString();

    const path = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
      params.repo,
    )}/pulls${qs ? `?${qs}` : ''}`;

    const response = await this.client.call<GitHubPullItem[]>(connection, path, {
      method: 'GET',
    });

    const prs = Array.isArray(response.data) ? response.data : [];
    return {
      data: { pullRequests: prs, count: prs.length },
      metadata: { statusCode: response.status },
    };
  }
}
