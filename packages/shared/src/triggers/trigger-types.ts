export const PUSH_TRIGGER_TYPES = [
  'stripe-event-received',
  'gmail-message-received',
  'drive-file-added',
  'outlook-message-received',
  'outlook-message-flagged',
  'onedrive-file-added',
  'slack-message-received',
  'slack-reaction-added',
  'discord-message-received',
  'telegram-message-received',
  'twilio-sms-received',
  'hubspot-contact-changed',
  'mailchimp-subscriber-added',
  'calendly-event-scheduled',
  'trello-card-changed',
] as const;
export type PushTriggerType = (typeof PUSH_TRIGGER_TYPES)[number];
export const isPushTriggerType = (value: string): value is PushTriggerType =>
  (PUSH_TRIGGER_TYPES as readonly string[]).includes(value);

export const POLL_TRIGGER_TYPES = [
  'sheets-row-added',
  'gmail-label-added',
  'calendar-event-created',
  'calendar-event-updated',
  'excel-row-added',
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
] as const;
export type ProviderTriggerProvider = (typeof PROVIDER_TRIGGER_PROVIDERS)[number];

export const TRIGGER_TYPE_TO_PROVIDER: Record<PushTriggerType, ProviderTriggerProvider> = {
  'stripe-event-received': 'stripe',
  'gmail-message-received': 'google',
  'drive-file-added': 'google',
  'outlook-message-received': 'microsoft',
  'outlook-message-flagged': 'microsoft',
  'onedrive-file-added': 'microsoft',
  'slack-message-received': 'slack',
  'slack-reaction-added': 'slack',
  'discord-message-received': 'discord-bot',
  'telegram-message-received': 'telegram',
  'twilio-sms-received': 'twilio',
  'hubspot-contact-changed': 'hubspot',
  'mailchimp-subscriber-added': 'mailchimp',
  'calendly-event-scheduled': 'calendly',
  'trello-card-changed': 'trello',
};
