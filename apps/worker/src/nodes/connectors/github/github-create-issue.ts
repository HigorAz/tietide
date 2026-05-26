import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { githubCreateIssueConfigSchema, type GitHubOAuth2Config } from '@tietide/shared';
import { GitHubClientFactory } from './github-client.factory';

export const GITHUB_CREATE_ISSUE_TYPE = 'github-create-issue';

interface GitHubIssueResponse {
  id?: number;
  number?: number;
  html_url?: string;
  state?: string;
  title?: string;
}

@Injectable()
export class GitHubCreateIssueAction extends BaseConnectorAction<GitHubOAuth2Config> {
  readonly type = GITHUB_CREATE_ISSUE_TYPE;
  readonly name = 'GitHub: Create Issue';
  readonly description = 'Open a new issue in a GitHub repository';
  readonly requiredConnectionType = 'github';

  constructor(private readonly client: GitHubClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GitHubOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = githubCreateIssueConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: {
            owner: params.owner,
            repo: params.repo,
            title: params.title,
          },
        },
        metadata: { mocked: true },
      };
    }

    const payload: Record<string, unknown> = { title: params.title };
    if (params.body !== undefined) payload.body = params.body;
    if (params.labels && params.labels.length > 0) payload.labels = params.labels;
    if (params.assignees && params.assignees.length > 0) payload.assignees = params.assignees;

    const path = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
      params.repo,
    )}/issues`;

    const response = await this.client.call<GitHubIssueResponse>(connection, path, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      data: {
        id: response.data.id ?? null,
        number: response.data.number ?? null,
        url: response.data.html_url ?? null,
        state: response.data.state ?? null,
        title: response.data.title ?? params.title,
      },
      metadata: { statusCode: response.status },
    };
  }
}
