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

// --- S15 commerce/data/storage read/update pack (#246) ---

export const mailchimpGetSubscriberConfigSchema = z.object({
  connectionId,
  listId: mailchimpListId,
  email: z.string().email().max(254),
  mockOnDryRun,
});
export type MailchimpGetSubscriberConfig = z.infer<typeof mailchimpGetSubscriberConfigSchema>;

export const mailchimpUpdateSubscriberConfigSchema = z
  .object({
    connectionId,
    listId: mailchimpListId,
    email: z.string().email().max(254),
    status: z.enum(MAILCHIMP_SUBSCRIBER_STATUSES).optional(),
    mergeFields: mailchimpMergeFields.optional(),
    mockOnDryRun,
  })
  .refine((v) => v.status !== undefined || v.mergeFields !== undefined, {
    message: 'provide a status or merge fields to update',
    path: ['status'],
  });
export type MailchimpUpdateSubscriberConfig = z.infer<typeof mailchimpUpdateSubscriberConfigSchema>;

export const mailchimpUnsubscribeConfigSchema = z.object({
  connectionId,
  listId: mailchimpListId,
  email: z.string().email().max(254),
  mockOnDryRun,
});
export type MailchimpUnsubscribeConfig = z.infer<typeof mailchimpUnsubscribeConfigSchema>;

export const mailchimpAddTagConfigSchema = z.object({
  connectionId,
  listId: mailchimpListId,
  email: z.string().email().max(254),
  tags: z.array(z.string().min(1).max(100)).min(1).max(50),
  mockOnDryRun,
});
export type MailchimpAddTagConfig = z.infer<typeof mailchimpAddTagConfigSchema>;

export const MAILCHIMP_CAMPAIGN_STATUSES = [
  'save',
  'paused',
  'schedule',
  'sending',
  'sent',
] as const;
export const mailchimpListCampaignsConfigSchema = z.object({
  connectionId,
  count: z.number().int().min(1).max(100).default(10),
  status: z.enum(MAILCHIMP_CAMPAIGN_STATUSES).optional(),
  mockOnDryRun,
});
export type MailchimpListCampaignsConfig = z.infer<typeof mailchimpListCampaignsConfigSchema>;
