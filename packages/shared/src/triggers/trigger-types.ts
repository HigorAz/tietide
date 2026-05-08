export const PUSH_TRIGGER_TYPES = [
  'stripe-event-received',
  'gmail-message-received',
  'drive-file-added',
] as const;
export type PushTriggerType = (typeof PUSH_TRIGGER_TYPES)[number];
export const isPushTriggerType = (value: string): value is PushTriggerType =>
  (PUSH_TRIGGER_TYPES as readonly string[]).includes(value);

export const POLL_TRIGGER_TYPES = [
  'sheets-row-added',
  'gmail-label-added',
  'calendar-event-created',
] as const;
export type PollTriggerType = (typeof POLL_TRIGGER_TYPES)[number];
export const isPollTriggerType = (value: string): value is PollTriggerType =>
  (POLL_TRIGGER_TYPES as readonly string[]).includes(value);

export const PROVIDER_TRIGGER_PROVIDERS = ['stripe', 'google'] as const;
export type ProviderTriggerProvider = (typeof PROVIDER_TRIGGER_PROVIDERS)[number];

export const TRIGGER_TYPE_TO_PROVIDER: Record<PushTriggerType, ProviderTriggerProvider> = {
  'stripe-event-received': 'stripe',
  'gmail-message-received': 'google',
  'drive-file-added': 'google',
};
