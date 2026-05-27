import { Injectable } from '@nestjs/common';
import { SlackBaseTrigger } from './slack-base.trigger';

export const SLACK_CHANNEL_CREATED_TYPE = 'slack-channel-created';

@Injectable()
export class SlackChannelCreatedTrigger extends SlackBaseTrigger {
  readonly type = SLACK_CHANNEL_CREATED_TYPE;
  readonly name = 'Slack: Channel Created';
  readonly description = 'Triggers when a new channel is created in the Slack workspace';

  constructor() {
    super(SlackChannelCreatedTrigger.name);
  }
}
