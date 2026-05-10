import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// HubSpot object IDs are numeric strings.
const hubspotId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^\d+$/, { message: 'must be a numeric HubSpot id' });

// Generic property bag — HubSpot accepts any custom property the portal exposes.
// Capped at 200 keys (HubSpot's documented per-call ceiling).
const hubspotProperties = z
  .record(z.string().min(1).max(200), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .refine((v) => Object.keys(v).length <= 200, { message: 'too many properties (>200)' });

export const hubspotCreateContactConfigSchema = z.object({
  connectionId,
  email: z.string().email().max(254),
  firstName: z.string().max(255).optional(),
  lastName: z.string().max(255).optional(),
  properties: hubspotProperties.optional(),
  mockOnDryRun,
});
export type HubspotCreateContactConfig = z.infer<typeof hubspotCreateContactConfigSchema>;

export const hubspotCreateDealConfigSchema = z.object({
  connectionId,
  name: z.string().min(1).max(512),
  amount: z.number().nonnegative().max(1e15).optional(),
  pipelineId: hubspotId.optional(),
  stageId: hubspotId.optional(),
  contactIds: z.array(hubspotId).max(50).optional(),
  properties: hubspotProperties.optional(),
  mockOnDryRun,
});
export type HubspotCreateDealConfig = z.infer<typeof hubspotCreateDealConfigSchema>;

// Subscription event types HubSpot emits for the contact-changed trigger.
export const HUBSPOT_CONTACT_EVENT_TYPES = [
  'contact.creation',
  'contact.deletion',
  'contact.propertyChange',
  'contact.merge',
  'contact.privacyDeletion',
  'contact.restore',
] as const;
export type HubspotContactEventType = (typeof HUBSPOT_CONTACT_EVENT_TYPES)[number];

export const hubspotContactChangedConfigSchema = z.object({
  connectionId,
  // Optional event-type filter; when set, the trigger only fires for these subscription types.
  eventTypes: z.array(z.enum(HUBSPOT_CONTACT_EVENT_TYPES)).max(6).optional(),
  // For propertyChange events: only fire when these properties change.
  propertyName: z.string().max(255).optional(),
});
export type HubspotContactChangedConfig = z.infer<typeof hubspotContactChangedConfigSchema>;
