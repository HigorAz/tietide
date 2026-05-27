import { Injectable } from '@nestjs/common';
import { SlackBaseTrigger } from './slack-base.trigger';

export const SLACK_APP_MENTION_TYPE = 'slack-app-mention';

@Injectable()
export class SlackAppMentionTrigger extends SlackBaseTrigger {
  readonly type = SLACK_APP_MENTION_TYPE;
  readonly name = 'Slack: App Mention';
  readonly description = 'Triggers when the app is @-mentioned in a Slack channel';

  constructor() {
    super(SlackAppMentionTrigger.name);
  }
}
