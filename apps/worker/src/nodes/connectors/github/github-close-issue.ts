import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { githubCloseIssueConfigSchema, type GitHubOAuth2Config } from '@tietide/shared';
import { GitHubClientFactory } from './github-client.factory';

export const GITHUB_CLOSE_ISSUE_TYPE = 'github-close-issue';

interface GitHubIssueResponse {
  number?: number;
  state?: string;
  html_url?: string;
}

@Injectable()
export class GitHubCloseIssueAction extends BaseConnectorAction<GitHubOAuth2Config> {
  readonly type = GITHUB_CLOSE_ISSUE_TYPE;
  readonly name = 'GitHub: Close Issue';
  readonly description = 'Close an open GitHub issue';
  readonly requiredConnectionType = 'github';

  constructor(private readonly client: GitHubClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GitHubOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = githubCloseIssueConfigSchema.parse(input.params);
    const issueNumber = Number(params.issueNumber);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveClosed: {
            owner: params.owner,
            repo: params.repo,
            issueNumber,
          },
        },
        metadata: { mocked: true },
      };
    }

    const path = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
      params.repo,
    )}/issues/${issueNumber}`;

    const response = await this.client.call<GitHubIssueResponse>(connection, path, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });

    return {
      data: {
        number: response.data.number ?? issueNumber,
        state: response.data.state ?? 'closed',
        url: response.data.html_url ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
