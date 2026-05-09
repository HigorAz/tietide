import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { githubCommentIssueConfigSchema, type GitHubApiKeyConfig } from '@tietide/shared';
import { GitHubClientFactory } from './github-client.factory';

export const GITHUB_COMMENT_ISSUE_TYPE = 'github-comment-issue';

interface GitHubCommentResponse {
  id?: number;
  html_url?: string;
  body?: string;
}

@Injectable()
export class GitHubCommentIssueAction extends BaseConnectorAction<GitHubApiKeyConfig> {
  readonly type = GITHUB_COMMENT_ISSUE_TYPE;
  readonly name = 'GitHub: Comment on Issue';
  readonly description = 'Post a comment on a GitHub issue or pull request';
  readonly requiredConnectionType = 'github';

  constructor(private readonly client: GitHubClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GitHubApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = githubCommentIssueConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCommented: {
            owner: params.owner,
            repo: params.repo,
            issueNumber: params.issueNumber,
          },
        },
        metadata: { mocked: true },
      };
    }

    // GitHub treats issues and PRs as the same resource for comments.
    const path = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
      params.repo,
    )}/issues/${params.issueNumber}/comments`;

    const response = await this.client.call<GitHubCommentResponse>(connection, path, {
      method: 'POST',
      body: JSON.stringify({ body: params.body }),
    });

    return {
      data: {
        id: response.data.id ?? null,
        url: response.data.html_url ?? null,
        body: response.data.body ?? params.body,
      },
      metadata: { statusCode: response.status },
    };
  }
}
