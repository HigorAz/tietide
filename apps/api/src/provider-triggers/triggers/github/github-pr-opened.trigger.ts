import { Injectable } from '@nestjs/common';
import { GithubRepoWebhookBaseTrigger } from './github-repo-webhook-base.trigger';

export const GITHUB_PR_OPENED_TYPE = 'github-pr-opened';

@Injectable()
export class GithubPrOpenedTrigger extends GithubRepoWebhookBaseTrigger {
  readonly type = GITHUB_PR_OPENED_TYPE;
  readonly name = 'GitHub: Pull Request Opened';
  readonly description =
    'Triggers when a pull request is opened in a GitHub repository (repo webhook)';
  protected readonly event = 'pull_request';
}
