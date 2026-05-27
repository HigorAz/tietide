import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { githubMergePrConfigSchema, type GitHubOAuth2Config } from '@tietide/shared';
import { GitHubClientFactory } from './github-client.factory';

export const GITHUB_MERGE_PR_TYPE = 'github-merge-pr';

interface GitHubMergeResponse {
  sha?: string;
  merged?: boolean;
  message?: string;
}

@Injectable()
export class GitHubMergePrAction extends BaseConnectorAction<GitHubOAuth2Config> {
  readonly type = GITHUB_MERGE_PR_TYPE;
  readonly name = 'GitHub: Merge Pull Request';
  readonly description = 'Merge a GitHub pull request (merge / squash / rebase)';
  readonly requiredConnectionType = 'github';

  constructor(private readonly client: GitHubClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GitHubOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = githubMergePrConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveMerged: {
            owner: params.owner,
            repo: params.repo,
            pullNumber: params.pullNumber,
          },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = {};
    if (params.mergeMethod) payload.merge_method = params.mergeMethod;
    if (params.commitTitle) payload.commit_title = params.commitTitle;

    const path = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
      params.repo,
    )}/pulls/${params.pullNumber}/merge`;

    const response = await this.client.call<GitHubMergeResponse>(connection, path, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    return {
      data: {
        merged: response.data.merged === true,
        sha: response.data.sha ?? null,
        message: response.data.message ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
