import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// Mailchimp list IDs are 10-char alphanumerics.
const mailchimpListId = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9]+$/, { message: 'must be a Mailchimp list id' });

// Campaign IDs are similar in shape; accept the same format.
const mailchimpCampaignId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9]+$/, { message: 'must be a Mailchimp campaign id' });

const mailchimpMergeFields = z
  .record(z.string().min(1).max(40), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .refine((v) => Object.keys(v).length <= 80, { message: 'too many merge fields (>80)' });

export const MAILCHIMP_SUBSCRIBER_STATUSES = [
  'subscribed',
  'unsubscribed',
  'pending',
  'cleaned',
  'transactional',
] as const;
export type MailchimpSubscriberStatus = (typeof MAILCHIMP_SUBSCRIBER_STATUSES)[number];

export const mailchimpAddSubscriberConfigSchema = z.object({
  connectionId,
  listId: mailchimpListId,
  email: z.string().email().max(254),
  status: z.enum(MAILCHIMP_SUBSCRIBER_STATUSES).default('subscribed'),
  mergeFields: mailchimpMergeFields.optional(),
  mockOnDryRun,
});
export type MailchimpAddSubscriberConfig = z.infer<typeof mailchimpAddSubscriberConfigSchema>;

export const mailchimpSendCampaignConfigSchema = z.object({
  connectionId,
  campaignId: mailchimpCampaignId,
  mockOnDryRun,
});
export type MailchimpSendCampaignConfig = z.infer<typeof mailchimpSendCampaignConfigSchema>;

export const MAILCHIMP_TRIGGER_EVENT_TYPES = [
  'subscribe',
  'unsubscribe',
  'profile',
  'cleaned',
  'upemail',
  'campaign',
] as const;
export type MailchimpTriggerEventType = (typeof MAILCHIMP_TRIGGER_EVENT_TYPES)[number];

export const mailchimpSubscriberAddedConfigSchema = z.object({
  connectionId,
  listId: mailchimpListId,
  // Mailchimp posts a single `type` field per webhook (e.g. "subscribe"). Filter at delivery.
  eventType: z.enum(MAILCHIMP_TRIGGER_EVENT_TYPES).optional(),
});
export type MailchimpSubscriberAddedConfig = z.infer<typeof mailchimpSubscriberAddedConfigSchema>;
