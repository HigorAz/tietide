import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { githubGetIssueConfigSchema, type GitHubOAuth2Config } from '@tietide/shared';
import { GitHubClientFactory } from './github-client.factory';

export const GITHUB_GET_ISSUE_TYPE = 'github-get-issue';

interface GitHubIssueResponse {
  id?: number;
  number?: number;
  title?: string;
  state?: string;
  html_url?: string;
  body?: string | null;
}

@Injectable()
export class GitHubGetIssueAction extends BaseConnectorAction<GitHubOAuth2Config> {
  readonly type = GITHUB_GET_ISSUE_TYPE;
  readonly name = 'GitHub: Get Issue';
  readonly description = 'Fetch a GitHub issue by number';
  readonly requiredConnectionType = 'github';

  constructor(private readonly client: GitHubClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GitHubOAuth2Config>,
    _context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = githubGetIssueConfigSchema.parse(input.params);

    const path = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
      params.repo,
    )}/issues/${params.issueNumber}`;

    const response = await this.client.call<GitHubIssueResponse>(connection, path, {
      method: 'GET',
    });

    return {
      data: {
        id: response.data.id ?? null,
        number: response.data.number ?? params.issueNumber,
        title: response.data.title ?? null,
        state: response.data.state ?? null,
        url: response.data.html_url ?? null,
        body: response.data.body ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
