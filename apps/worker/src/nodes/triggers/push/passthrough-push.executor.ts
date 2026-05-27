import { Injectable } from '@nestjs/common';
import type { INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';

/**
 * Worker-side stand-in for any push-trigger node type. Push trigger
 * activation/deactivation/verification all run in the API process.
 * Inside a workflow execution the trigger node is just a passthrough --
 * its job is to surface the inbound event payload (already on
 * input.data via triggerData) to the next node in the graph.
 */
export class PassthroughPushExecutor implements INodeExecutor {
  readonly category = 'trigger' as const;

  constructor(
    readonly type: string,
    readonly name: string,
    readonly description: string,
  ) {}

  async execute(input: NodeInput): Promise<NodeOutput> {
    return { data: input.data ?? {} };
  }
}

@Injectable()
export class StripeEventReceivedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'stripe-event-received',
      'Stripe: Event Received',
      'Triggers when Stripe delivers a webhook event to the workflow',
    );
  }
}

@Injectable()
export class DriveFileAddedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'drive-file-added',
      'Drive: File Added',
      'Triggers when Google Drive notifies that a watched folder changed',
    );
  }
}

@Injectable()
export class DriveFileUpdatedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'drive-file-updated',
      'Drive: File Updated',
      'Triggers when Google Drive notifies that a watched file was modified',
    );
  }
}

@Injectable()
export class OutlookMessageReceivedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'outlook-message-received',
      'Outlook: Message Received',
      'Triggers when Microsoft Graph notifies that a new Outlook message arrived',
    );
  }
}

@Injectable()
export class OutlookMessageFlaggedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'outlook-message-flagged',
      'Outlook: Message Flagged',
      'Triggers when Microsoft Graph notifies that an Outlook message was flagged',
    );
  }
}

@Injectable()
export class OutlookMessageWithAttachmentPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'outlook-message-with-attachment',
      'Outlook: Message With Attachment',
      'Triggers when Microsoft Graph notifies that a new Outlook message with attachments arrived',
    );
  }
}

@Injectable()
export class OnedriveFileAddedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'onedrive-file-added',
      'OneDrive: File Added',
      'Triggers when Microsoft Graph notifies that the user OneDrive root changed',
    );
  }
}

@Injectable()
export class SlackMessageReceivedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'slack-message-received',
      'Slack: Message Received',
      'Triggers when Slack delivers a message event to the workflow',
    );
  }
}

@Injectable()
export class SlackReactionAddedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'slack-reaction-added',
      'Slack: Reaction Added',
      'Triggers when Slack delivers a reaction_added event to the workflow',
    );
  }
}

@Injectable()
export class SlackAppMentionPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'slack-app-mention',
      'Slack: App Mention',
      'Triggers when Slack delivers an app_mention event to the workflow',
    );
  }
}

@Injectable()
export class SlackChannelCreatedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'slack-channel-created',
      'Slack: Channel Created',
      'Triggers when Slack delivers a channel_created event to the workflow',
    );
  }
}

@Injectable()
export class TelegramCallbackQueryReceivedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'telegram-callback-query-received',
      'Telegram: Callback Query Received',
      'Triggers when a Telegram inline-keyboard button callback is delivered to the workflow',
    );
  }
}

@Injectable()
export class DiscordMessageReceivedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'discord-message-received',
      'Discord: Slash Command Received',
      'Triggers when a Discord slash command interaction is delivered to the workflow',
    );
  }
}

@Injectable()
export class TelegramMessageReceivedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'telegram-message-received',
      'Telegram: Message Received',
      'Triggers when a Telegram bot receives a message',
    );
  }
}

@Injectable()
export class TwilioSmsReceivedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'twilio-sms-received',
      'Twilio: SMS Received',
      'Triggers when a Twilio phone number receives an inbound SMS',
    );
  }
}

@Injectable()
export class HubspotContactChangedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'hubspot-contact-changed',
      'HubSpot: Contact Changed',
      'Triggers when a HubSpot contact is created, updated, or deleted',
    );
  }
}

@Injectable()
export class MailchimpSubscriberAddedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'mailchimp-subscriber-added',
      'Mailchimp: Subscriber Added',
      'Triggers when a Mailchimp audience webhook fires (subscribe / unsubscribe / cleaned)',
    );
  }
}

@Injectable()
export class CalendlyEventScheduledPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'calendly-event-scheduled',
      'Calendly: Event Scheduled',
      'Triggers when a Calendly invitee schedules or cancels an event',
    );
  }
}

@Injectable()
export class TrelloCardChangedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'trello-card-changed',
      'Trello: Card Changed',
      'Triggers when a Trello board emits a card-related action',
    );
  }
}

@Injectable()
export class GithubIssueOpenedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'github-issue-opened',
      'GitHub: Issue Opened',
      'Triggers when an issue is opened in a watched GitHub repository',
    );
  }
}

@Injectable()
export class GithubPrOpenedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'github-pr-opened',
      'GitHub: Pull Request Opened',
      'Triggers when a pull request is opened in a watched GitHub repository',
    );
  }
}
