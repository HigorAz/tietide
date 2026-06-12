/**
 * Boot-time environment validation.
 *
 * Wired into `ConfigModule.forRoot({ validate })`, so the process refuses to
 * start when a production deployment is still carrying the documented sample
 * secrets (the values shipped in `.env.example`). Enforcement is
 * production-only: dev and test legitimately run with those placeholders.
 */

/** Minimum length for a real secret. 32 bytes of entropy hex-encoded is 64; we floor lower to allow base64. */
export const MIN_SECRET_LENGTH = 32;

/** Secrets that must be strong before we accept a production boot. */
const REQUIRED_SECRETS = ['JWT_SECRET', 'WEBHOOK_HMAC_SECRET', 'ENCRYPTION_MASTER_KEY'] as const;

/**
 * Values that must merely be present (non-empty) in production — they gate
 * access but are not strength-checked like the cryptographic secrets above.
 *
 * `METRICS_TOKEN` (W5.36): the `/metrics` scrape endpoint is open when no token
 * is configured, which is fine in a network-isolated dev box but leaks
 * operational telemetry on an internet-exposed deploy that forgets to set it.
 * Requiring it in production makes metrics default-closed — the app fails fast
 * at boot rather than serving metrics unauthenticated.
 */
const REQUIRED_PRESENT = ['METRICS_TOKEN'] as const;

/**
 * Substrings that mark a value as a placeholder rather than a real secret.
 * Case-insensitive. Covers the `.env.example` defaults plus common weak markers.
 */
const WEAK_MARKERS = [
  'change',
  'your-',
  'placeholder',
  'example',
  'changeme',
  'base64-encoded',
  'secret-key',
  'todo',
  'xxxx',
];

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return WEAK_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Validate the environment. Returns the config untouched on success; throws an
 * aggregated Error listing every offending secret on failure.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  if (config.NODE_ENV !== 'production') {
    return config;
  }

  const errors: string[] = [];

  for (const key of REQUIRED_SECRETS) {
    const raw = config[key];
    const value = typeof raw === 'string' ? raw.trim() : '';

    if (!value) {
      errors.push(`${key} is required in production but is missing or empty.`);
      continue;
    }
    if (value.length < MIN_SECRET_LENGTH) {
      errors.push(`${key} must be at least ${MIN_SECRET_LENGTH} characters in production.`);
    }
    if (isPlaceholder(value)) {
      errors.push(`${key} still looks like a placeholder — set a real secret in production.`);
    }
  }

  for (const key of REQUIRED_PRESENT) {
    const raw = config[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) {
      errors.push(`${key} is required in production but is missing or empty.`);
    }
  }

  // Conditional pairing (W5.26): if the platform Stripe secret key is configured,
  // the webhook signing secret MUST also be present. Otherwise the billing webhook
  // receiver can never verify Stripe signatures and subscription sync silently
  // breaks with only a warn log. Both-unset is valid (Stripe optional in dev/self-host).
  const stripeKey =
    typeof config.STRIPE_SECRET_KEY === 'string' ? config.STRIPE_SECRET_KEY.trim() : '';
  if (stripeKey) {
    const webhookSecret =
      typeof config.STRIPE_WEBHOOK_SECRET === 'string' ? config.STRIPE_WEBHOOK_SECRET.trim() : '';
    if (!webhookSecret) {
      errors.push(
        'STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set — webhook signature verification cannot work without it.',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production environment:\n  - ${errors.join('\n  - ')}`);
  }

  return config;
}
