import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { githubListIssuesConfigSchema, type GitHubOAuth2Config } from '@tietide/shared';
import { GitHubClientFactory } from './github-client.factory';

export const GITHUB_LIST_ISSUES_TYPE = 'github-list-issues';

// GitHub's issues endpoint returns pull requests too; PR items carry a
// `pull_request` property, which we use to filter them out.
interface GitHubIssueListItem {
  pull_request?: unknown;
  [key: string]: unknown;
}

@Injectable()
export class GitHubListIssuesAction extends BaseConnectorAction<GitHubOAuth2Config> {
  readonly type = GITHUB_LIST_ISSUES_TYPE;
  readonly name = 'GitHub: List Issues';
  readonly description = 'List issues in a GitHub repository (excludes pull requests)';
  readonly requiredConnectionType = 'github';

  constructor(private readonly client: GitHubClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GitHubOAuth2Config>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = githubListIssuesConfigSchema.parse(input.params);

    const search = new URLSearchParams();
    if (params.state) search.set('state', params.state);
    if (params.labels && params.labels.length > 0) search.set('labels', params.labels.join(','));
    if (params.perPage !== undefined) search.set('per_page', String(params.perPage));
    const qs = search.toString();

    const path = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
      params.repo,
    )}/issues${qs ? `?${qs}` : ''}`;

    const response = await this.client.call<GitHubIssueListItem[]>(connection, path, {
      method: 'GET',
    });

    const all = Array.isArray(response.data) ? response.data : [];
    const issues = all.filter((item) => item.pull_request === undefined);
    return {
      data: { issues, count: issues.length },
      metadata: { statusCode: response.status },
    };
  }
}
