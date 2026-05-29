import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { githubGetRepoConfigSchema, type GitHubOAuth2Config } from '@tietide/shared';
import { GitHubClientFactory } from './github-client.factory';

export const GITHUB_GET_REPO_TYPE = 'github-get-repo';

interface GitHubRepoResponse {
  id?: number;
  full_name?: string;
  private?: boolean;
  html_url?: string;
  default_branch?: string;
  stargazers_count?: number;
  open_issues_count?: number;
  description?: string | null;
}

@Injectable()
export class GitHubGetRepoAction extends BaseConnectorAction<GitHubOAuth2Config> {
  readonly type = GITHUB_GET_REPO_TYPE;
  readonly name = 'GitHub: Get Repository';
  readonly description = 'Fetch metadata for a GitHub repository';
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
    const params = githubGetRepoConfigSchema.parse(input.params);

    const path = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}`;

    const response = await this.client.call<GitHubRepoResponse>(connection, path, {
      method: 'GET',
    });

    return {
      data: {
        id: response.data.id ?? null,
        fullName: response.data.full_name ?? `${params.owner}/${params.repo}`,
        private: response.data.private === true,
        url: response.data.html_url ?? null,
        defaultBranch: response.data.default_branch ?? null,
        stargazers: response.data.stargazers_count ?? null,
        openIssues: response.data.open_issues_count ?? null,
        description: response.data.description ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
