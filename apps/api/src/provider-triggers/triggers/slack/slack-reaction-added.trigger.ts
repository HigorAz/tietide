import { Injectable } from '@nestjs/common';
import { SlackBaseTrigger } from './slack-base.trigger';

export const SLACK_REACTION_ADDED_TYPE = 'slack-reaction-added';

@Injectable()
export class SlackReactionAddedTrigger extends SlackBaseTrigger {
  readonly type = SLACK_REACTION_ADDED_TYPE;
  readonly name = 'Slack: Reaction Added';
  readonly description = 'Triggers when a reaction is added to a Slack message';

  constructor() {
    super(SlackReactionAddedTrigger.name);
  }
}
