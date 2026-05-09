import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { githubCreatePrConfigSchema, type GitHubApiKeyConfig } from '@tietide/shared';
import { GitHubClientFactory } from './github-client.factory';

export const GITHUB_CREATE_PR_TYPE = 'github-create-pr';

interface GitHubPullResponse {
  id?: number;
  number?: number;
  html_url?: string;
  state?: string;
  draft?: boolean;
  title?: string;
}

@Injectable()
export class GitHubCreatePrAction extends BaseConnectorAction<GitHubApiKeyConfig> {
  readonly type = GITHUB_CREATE_PR_TYPE;
  readonly name = 'GitHub: Create Pull Request';
  readonly description = 'Open a pull request from one branch into another';
  readonly requiredConnectionType = 'github';

  constructor(private readonly client: GitHubClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GitHubApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = githubCreatePrConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveOpened: {
            owner: params.owner,
            repo: params.repo,
            head: params.head,
            base: params.base,
            title: params.title,
          },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = {
      title: params.title,
      head: params.head,
      base: params.base,
    };
    if (params.body !== undefined) payload.body = params.body;
    if (params.draft !== undefined) payload.draft = params.draft;

    const path = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
      params.repo,
    )}/pulls`;

    const response = await this.client.call<GitHubPullResponse>(connection, path, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      data: {
        id: response.data.id ?? null,
        number: response.data.number ?? null,
        url: response.data.html_url ?? null,
        state: response.data.state ?? null,
        draft: response.data.draft === true,
        title: response.data.title ?? params.title,
      },
      metadata: { statusCode: response.status },
    };
  }
}
