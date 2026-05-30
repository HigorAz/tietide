import type { HelmetOptions } from 'helmet';

/** Vite dev server origin — the only permissive fallback, and only outside production. */
export const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function isProduction(env: Env = process.env): boolean {
  return env.NODE_ENV === 'production';
}

/** Split a comma-separated origin list into trimmed, non-empty entries. */
function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Resolve the allowed CORS origin(s).
 *
 * In production `CORS_ORIGIN` is mandatory: we refuse to boot with a permissive
 * localhost fallback (silently allowing the dev origin in prod is the bug).
 * Outside production we fall back to the Vite dev origin. A comma-separated
 * value yields an array; a single value yields a string.
 */
export function resolveCorsOrigin(env: Env = process.env): string | string[] {
  const raw = env.CORS_ORIGIN?.trim();

  if (isProduction(env)) {
    const origins = raw ? parseOrigins(raw) : [];
    if (origins.length === 0) {
      throw new Error(
        'CORS_ORIGIN must be set to an explicit origin in production (refusing permissive default).',
      );
    }
    return origins.length === 1 ? origins[0] : origins;
  }

  if (!raw) return DEFAULT_CORS_ORIGIN;
  const origins = parseOrigins(raw);
  return origins.length <= 1 ? (origins[0] ?? DEFAULT_CORS_ORIGIN) : origins;
}

/**
 * Env-aware helmet options.
 *
 * Production: pin a strong HSTS policy (1 year, subdomains, preload) and a
 * locked-down CSP — the API serves JSON only, so it never needs to load scripts
 * or be framed. Non-production: HSTS is meaningless over plain HTTP, and the
 * strict CSP would break the Swagger UI we serve in dev, so both are relaxed.
 */
export function buildHelmetOptions(env: Env = process.env): HelmetOptions {
  const prod = isProduction(env);
  return {
    hsts: prod ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    contentSecurityPolicy: prod
      ? {
          useDefaults: false,
          directives: {
            'default-src': ["'none'"],
            'frame-ancestors': ["'none'"],
          },
        }
      : false,
  };
}

/**
 * Resolve Express's `trust proxy` setting.
 *
 * The API runs behind a reverse proxy / tunnel in production, so without this
 * Express reports the proxy's IP for every request — collapsing the rate
 * limiter onto a single bucket and making `X-Forwarded-For` invisible. Driven
 * by `TRUST_PROXY`: a number = how many proxy hops to trust (recommended `1`),
 * `"true"` = trust all (only safe when every upstream is trusted), anything
 * else / unset = disabled. We never default to trust-all, since that lets
 * clients spoof their IP via `X-Forwarded-For`.
 */
export function resolveTrustProxy(env: Env = process.env): number | boolean {
  const raw = env.TRUST_PROXY?.trim();
  if (!raw || raw === 'false' || raw === '0') return false;
  if (raw === 'true') return true;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops > 0 ? hops : false;
}

/**
 * Whether to mount the Swagger UI / OpenAPI document.
 *
 * Off by default in production (the spec leaks the full attack surface); opt in
 * with `SWAGGER_ENABLED=true`. On by default in dev; opt out with
 * `SWAGGER_ENABLED=false`.
 */
export function shouldEnableSwagger(env: Env = process.env): boolean {
  if (isProduction(env)) {
    return env.SWAGGER_ENABLED === 'true';
  }
  return env.SWAGGER_ENABLED !== 'false';
}
