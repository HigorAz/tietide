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

export const stripeGetCustomerConfigSchema = z.object({
  connectionId,
  customerId: stripeCustomerId,
  mockOnDryRun,
});
export type StripeGetCustomerConfig = z.infer<typeof stripeGetCustomerConfigSchema>;

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

// 3-letter ISO currency code (Stripe accepts lowercase; the action lowercases).
const stripeCurrency = z
  .string()
  .regex(/^[a-zA-Z]{3}$/, { message: 'currency must be a 3-letter ISO code (e.g. usd)' });

export const stripeFindCustomerConfigSchema = z.object({
  connectionId,
  email: z.string().email().max(254),
  limit: z.number().int().min(1).max(100).default(1),
  mockOnDryRun,
});
export type StripeFindCustomerConfig = z.infer<typeof stripeFindCustomerConfigSchema>;

export const stripeCreatePaymentIntentConfigSchema = z.object({
  connectionId,
  // Amount in the currency's smallest unit (cents). Stripe's max is large; cap defensively.
  amount: z.number().int().positive().max(99_999_999),
  currency: stripeCurrency,
  customerId: stripeCustomerId.optional(),
  description: z.string().max(1000).optional(),
  metadata: stripeMetadata.optional(),
  mockOnDryRun,
});
export type StripeCreatePaymentIntentConfig = z.infer<typeof stripeCreatePaymentIntentConfigSchema>;

export const stripeCreateRefundConfigSchema = z
  .object({
    connectionId,
    paymentIntentId: z
      .string()
      .regex(/^pi_[A-Za-z0-9]+$/, { message: 'must be a Stripe PaymentIntent id (pi_…)' })
      .optional(),
    chargeId: z
      .string()
      .regex(/^ch_[A-Za-z0-9]+$/, { message: 'must be a Stripe Charge id (ch_…)' })
      .optional(),
    amount: z.number().int().positive().max(99_999_999).optional(),
    reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
    mockOnDryRun,
  })
  .refine((v) => Boolean(v.paymentIntentId) || Boolean(v.chargeId), {
    message: 'provide either paymentIntentId or chargeId',
    path: ['paymentIntentId'],
  });
export type StripeCreateRefundConfig = z.infer<typeof stripeCreateRefundConfigSchema>;

export const STRIPE_INVOICE_STATUSES = ['draft', 'open', 'paid', 'uncollectible', 'void'] as const;
export const stripeListInvoicesConfigSchema = z.object({
  connectionId,
  customerId: stripeCustomerId.optional(),
  status: z.enum(STRIPE_INVOICE_STATUSES).optional(),
  limit: z.number().int().min(1).max(100).default(10),
  startingAfter: z.string().max(64).optional(),
  mockOnDryRun,
});
export type StripeListInvoicesConfig = z.infer<typeof stripeListInvoicesConfigSchema>;

export const stripeCreateSubscriptionConfigSchema = z.object({
  connectionId,
  customerId: stripeCustomerId,
  priceId: z
    .string()
    .regex(/^price_[A-Za-z0-9]+$/, { message: 'must be a Stripe Price id (price_…)' }),
  quantity: z.number().int().min(1).max(1000).optional(),
  metadata: stripeMetadata.optional(),
  mockOnDryRun,
});
export type StripeCreateSubscriptionConfig = z.infer<typeof stripeCreateSubscriptionConfigSchema>;
