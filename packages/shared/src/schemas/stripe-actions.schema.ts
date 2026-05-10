import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// Stripe customer / charge IDs.
const stripeCustomerId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^cus_[A-Za-z0-9]+$/, { message: 'must be a Stripe customer id (cus_…)' });

// Free-form metadata bag (Stripe accepts <=50 keys, <=500 chars per value).
const stripeMetadata = z
  .record(z.string().min(1).max(40), z.string().max(500))
  .refine((v) => Object.keys(v).length <= 50, { message: 'too many metadata keys (>50)' });

export const stripeCreateCustomerConfigSchema = z.object({
  connectionId,
  email: z.string().email().max(254).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  metadata: stripeMetadata.optional(),
  mockOnDryRun,
});
export type StripeCreateCustomerConfig = z.infer<typeof stripeCreateCustomerConfigSchema>;

export const stripeListChargesConfigSchema = z.object({
  connectionId,
  customerId: stripeCustomerId.optional(),
  limit: z.number().int().min(1).max(100).default(10),
  startingAfter: z.string().max(64).optional(),
  mockOnDryRun,
});
export type StripeListChargesConfig = z.infer<typeof stripeListChargesConfigSchema>;

// Stripe webhook event types are open-ended; we accept any string and let Stripe validate.
// Empty / undefined means "all events" (matches the existing trigger contract).
export const stripeEventReceivedConfigSchema = z.object({
  connectionId,
  events: z.array(z.string().min(1).max(128)).max(50).optional(),
  // Single eventType filter applied at delivery time (defence in depth alongside
  // the activation-time `events` array). When set, the trigger drops events
  // whose `event.type` does not match.
  eventType: z.string().min(1).max(128).optional(),
});
export type StripeEventReceivedConfig = z.infer<typeof stripeEventReceivedConfigSchema>;
