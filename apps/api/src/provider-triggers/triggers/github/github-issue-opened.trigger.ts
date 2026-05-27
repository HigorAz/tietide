import { Injectable } from '@nestjs/common';
import { GithubRepoWebhookBaseTrigger } from './github-repo-webhook-base.trigger';

export const GITHUB_ISSUE_OPENED_TYPE = 'github-issue-opened';

@Injectable()
export class GithubIssueOpenedTrigger extends GithubRepoWebhookBaseTrigger {
  readonly type = GITHUB_ISSUE_OPENED_TYPE;
  readonly name = 'GitHub: Issue Opened';
  readonly description = 'Triggers when an issue is opened in a GitHub repository (repo webhook)';
  protected readonly event = 'issues';
}
