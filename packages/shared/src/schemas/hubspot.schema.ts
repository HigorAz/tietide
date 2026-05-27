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

// Subscription event types HubSpot emits for the deal-changed trigger (#246).
export const HUBSPOT_DEAL_EVENT_TYPES = [
  'deal.creation',
  'deal.deletion',
  'deal.propertyChange',
  'deal.merge',
  'deal.restore',
] as const;
export type HubspotDealEventType = (typeof HUBSPOT_DEAL_EVENT_TYPES)[number];

export const hubspotDealChangedConfigSchema = z.object({
  connectionId,
  eventTypes: z.array(z.enum(HUBSPOT_DEAL_EVENT_TYPES)).max(5).optional(),
  propertyName: z.string().max(255).optional(),
});
export type HubspotDealChangedConfig = z.infer<typeof hubspotDealChangedConfigSchema>;

// --- S15 commerce/data/storage read/update pack (#246) ---

export const hubspotFindContactConfigSchema = z.object({
  connectionId,
  email: z.string().email().max(254),
  mockOnDryRun,
});
export type HubspotFindContactConfig = z.infer<typeof hubspotFindContactConfigSchema>;

export const hubspotGetContactConfigSchema = z.object({
  connectionId,
  contactId: hubspotId,
  mockOnDryRun,
});
export type HubspotGetContactConfig = z.infer<typeof hubspotGetContactConfigSchema>;

export const hubspotUpdateContactConfigSchema = z.object({
  connectionId,
  contactId: hubspotId,
  properties: hubspotProperties,
  mockOnDryRun,
});
export type HubspotUpdateContactConfig = z.infer<typeof hubspotUpdateContactConfigSchema>;

export const hubspotUpdateDealConfigSchema = z.object({
  connectionId,
  dealId: hubspotId,
  properties: hubspotProperties,
  mockOnDryRun,
});
export type HubspotUpdateDealConfig = z.infer<typeof hubspotUpdateDealConfigSchema>;

export const hubspotCreateCompanyConfigSchema = z.object({
  connectionId,
  name: z.string().min(1).max(512),
  domain: z.string().max(255).optional(),
  properties: hubspotProperties.optional(),
  mockOnDryRun,
});
export type HubspotCreateCompanyConfig = z.infer<typeof hubspotCreateCompanyConfigSchema>;

export const hubspotCreateNoteConfigSchema = z.object({
  connectionId,
  body: z.string().min(1).max(65_536),
  // Optional associations to an existing contact and/or deal.
  contactId: hubspotId.optional(),
  dealId: hubspotId.optional(),
  mockOnDryRun,
});
export type HubspotCreateNoteConfig = z.infer<typeof hubspotCreateNoteConfigSchema>;
