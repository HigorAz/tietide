export const PUSH_TRIGGER_TYPES = [
  'stripe-event-received',
  'gmail-message-received',
  'drive-file-added',
  'drive-file-updated',
  'outlook-message-received',
  'outlook-message-flagged',
  'outlook-message-with-attachment',
  'onedrive-file-added',
  'slack-message-received',
  'slack-reaction-added',
  'slack-app-mention',
  'slack-channel-created',
  'discord-message-received',
  'telegram-message-received',
  'telegram-callback-query-received',
  'twilio-sms-received',
  'hubspot-contact-changed',
  'mailchimp-subscriber-added',
  'calendly-event-scheduled',
  'trello-card-changed',
  'github-issue-opened',
  'github-pr-opened',
  'stripe-invoice-paid',
  'hubspot-deal-changed',
  'whatsapp-message-received',
] as const;
export type PushTriggerType = (typeof PUSH_TRIGGER_TYPES)[number];
export const isPushTriggerType = (value: string): value is PushTriggerType =>
  (PUSH_TRIGGER_TYPES as readonly string[]).includes(value);

export const POLL_TRIGGER_TYPES = [
  'sheets-row-added',
  'gmail-new-email-received',
  'gmail-label-added',
  'gmail-attachment-received',
  'calendar-event-created',
  'calendar-event-updated',
  'excel-row-added',
  'excel-row-updated',
  'notion-database-item-updated',
  'airtable-record-created',
  'linear-issue-updated',
  's3-object-created',
  'instagram-comment-added',
] as const;
export type PollTriggerType = (typeof POLL_TRIGGER_TYPES)[number];
export const isPollTriggerType = (value: string): value is PollTriggerType =>
  (POLL_TRIGGER_TYPES as readonly string[]).includes(value);

export const PROVIDER_TRIGGER_PROVIDERS = [
  'stripe',
  'google',
  'microsoft',
  'slack',
  'discord-bot',
  'telegram',
  'twilio',
  'hubspot',
  'mailchimp',
  'calendly',
  'trello',
  'github',
  'whatsapp',
] as const;
export type ProviderTriggerProvider = (typeof PROVIDER_TRIGGER_PROVIDERS)[number];

export const TRIGGER_TYPE_TO_PROVIDER: Record<PushTriggerType, ProviderTriggerProvider> = {
  'stripe-event-received': 'stripe',
  'gmail-message-received': 'google',
  'drive-file-added': 'google',
  'drive-file-updated': 'google',
  'outlook-message-received': 'microsoft',
  'outlook-message-flagged': 'microsoft',
  'outlook-message-with-attachment': 'microsoft',
  'onedrive-file-added': 'microsoft',
  'slack-message-received': 'slack',
  'slack-reaction-added': 'slack',
  'slack-app-mention': 'slack',
  'slack-channel-created': 'slack',
  'discord-message-received': 'discord-bot',
  'telegram-message-received': 'telegram',
  'telegram-callback-query-received': 'telegram',
  'twilio-sms-received': 'twilio',
  'hubspot-contact-changed': 'hubspot',
  'mailchimp-subscriber-added': 'mailchimp',
  'calendly-event-scheduled': 'calendly',
  'trello-card-changed': 'trello',
  'github-issue-opened': 'github',
  'github-pr-opened': 'github',
  'stripe-invoice-paid': 'stripe',
  'hubspot-deal-changed': 'hubspot',
  'whatsapp-message-received': 'whatsapp',
};
