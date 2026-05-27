import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// Calendly v2 user URIs follow https://api.calendly.com/users/<uuid>.
const calendlyUserUri = z.string().min(1).max(512).url({ message: 'must be a Calendly user URI' });

const isoDateTime = z.string().datetime({ offset: true }).max(64);

export const calendlyListEventsConfigSchema = z.object({
  connectionId,
  userUri: calendlyUserUri,
  minStartTime: isoDateTime.optional(),
  maxStartTime: isoDateTime.optional(),
  status: z.union([z.literal('active'), z.literal('canceled')]).optional(),
  count: z.number().int().min(1).max(100).default(20),
  mockOnDryRun,
});
export type CalendlyListEventsConfig = z.infer<typeof calendlyListEventsConfigSchema>;

export const CALENDLY_TRIGGER_EVENT_TYPES = [
  'invitee.created',
  'invitee.canceled',
  'invitee_no_show.created',
  'invitee_no_show.deleted',
  'routing_form_submission.created',
] as const;
export type CalendlyTriggerEventType = (typeof CALENDLY_TRIGGER_EVENT_TYPES)[number];

export const calendlyEventScheduledConfigSchema = z.object({
  connectionId,
  // Either organization or user-scoped subscription URI. Organization scope catches
  // events for any user under the org; user scope is narrower.
  scope: z.union([z.literal('organization'), z.literal('user')]).default('user'),
  organizationUri: z.string().url().max(512).optional(),
  userUri: calendlyUserUri.optional(),
  // Optional event-type filter applied at delivery time.
  eventType: z.enum(CALENDLY_TRIGGER_EVENT_TYPES).optional(),
});
export type CalendlyEventScheduledConfig = z.infer<typeof calendlyEventScheduledConfigSchema>;

// --- S15 commerce/data/storage read/update pack (#246) ---

// The UUID segment of a Calendly scheduled-event URI (…/scheduled_events/<uuid>).
const calendlyEventUuid = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9-]+$/, { message: 'must be a Calendly event UUID' });

export const calendlyGetEventConfigSchema = z.object({
  connectionId,
  eventUuid: calendlyEventUuid,
  mockOnDryRun,
});
export type CalendlyGetEventConfig = z.infer<typeof calendlyGetEventConfigSchema>;

export const calendlyCancelEventConfigSchema = z.object({
  connectionId,
  eventUuid: calendlyEventUuid,
  reason: z.string().max(1000).optional(),
  mockOnDryRun,
});
export type CalendlyCancelEventConfig = z.infer<typeof calendlyCancelEventConfigSchema>;

export const calendlyListInviteesConfigSchema = z.object({
  connectionId,
  eventUuid: calendlyEventUuid,
  count: z.number().int().min(1).max(100).default(20),
  status: z.union([z.literal('active'), z.literal('canceled')]).optional(),
  mockOnDryRun,
});
export type CalendlyListInviteesConfig = z.infer<typeof calendlyListInviteesConfigSchema>;
