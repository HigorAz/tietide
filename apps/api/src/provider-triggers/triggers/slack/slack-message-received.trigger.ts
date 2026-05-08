import { Injectable } from '@nestjs/common';
import { SlackBaseTrigger } from './slack-base.trigger';

export const SLACK_MESSAGE_RECEIVED_TYPE = 'slack-message-received';

@Injectable()
export class SlackMessageReceivedTrigger extends SlackBaseTrigger {
  readonly type = SLACK_MESSAGE_RECEIVED_TYPE;
  readonly name = 'Slack: Message Received';
  readonly description = 'Triggers when a message is posted to a Slack channel';

  constructor() {
    super(SlackMessageReceivedTrigger.name);
  }
}
