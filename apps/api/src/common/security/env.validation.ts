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

  if (errors.length > 0) {
    throw new Error(`Invalid production environment:\n  - ${errors.join('\n  - ')}`);
  }

  return config;
}
