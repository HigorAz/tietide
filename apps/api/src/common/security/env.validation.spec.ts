import { MIN_SECRET_LENGTH, validateEnv } from './env.validation';

// A plausible "real" secret: long, high-entropy, no weak markers.
const STRONG = 'k7Qf2pX9vR4tZ8mN1bY6wL3sD0hJ5gC';
const STRONG_LONG = STRONG + STRONG; // 62 chars, comfortably over the floor

const prodBase = {
  NODE_ENV: 'production',
  JWT_SECRET: STRONG_LONG,
  WEBHOOK_HMAC_SECRET: STRONG_LONG,
  ENCRYPTION_MASTER_KEY: STRONG_LONG,
  METRICS_TOKEN: STRONG_LONG,
};

describe('validateEnv', () => {
  it('passes through documented placeholder secrets outside production', () => {
    const env = {
      NODE_ENV: 'development',
      JWT_SECRET: 'your-super-secret-jwt-key-change-in-production',
      WEBHOOK_HMAC_SECRET: 'your-webhook-hmac-secret',
      ENCRYPTION_MASTER_KEY: 'base64-encoded-32-byte-key-for-libsodium',
    };
    expect(validateEnv(env)).toBe(env);
  });

  it('accepts strong secrets in production', () => {
    expect(() => validateEnv(prodBase)).not.toThrow();
    expect(validateEnv(prodBase)).toBe(prodBase);
  });

  it('rejects the placeholder JWT_SECRET in production', () => {
    expect(() =>
      validateEnv({ ...prodBase, JWT_SECRET: 'your-super-secret-jwt-key-change-in-production' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects the placeholder WEBHOOK_HMAC_SECRET in production', () => {
    expect(() =>
      validateEnv({ ...prodBase, WEBHOOK_HMAC_SECRET: 'your-webhook-hmac-secret' }),
    ).toThrow(/WEBHOOK_HMAC_SECRET/);
  });

  it('rejects the placeholder ENCRYPTION_MASTER_KEY in production', () => {
    expect(() =>
      validateEnv({
        ...prodBase,
        ENCRYPTION_MASTER_KEY: 'base64-encoded-32-byte-key-for-libsodium',
      }),
    ).toThrow(/ENCRYPTION_MASTER_KEY/);
  });

  it('rejects a too-short secret in production', () => {
    expect(() => validateEnv({ ...prodBase, JWT_SECRET: 'short' })).toThrow(
      new RegExp(String(MIN_SECRET_LENGTH)),
    );
  });

  it('rejects a missing required secret in production', () => {
    const env: Record<string, unknown> = { ...prodBase };
    delete env.JWT_SECRET;
    expect(() => validateEnv(env)).toThrow(/JWT_SECRET/);
  });

  it('rejects a missing METRICS_TOKEN in production (default-closed metrics)', () => {
    const env: Record<string, unknown> = { ...prodBase };
    delete env.METRICS_TOKEN;
    expect(() => validateEnv(env)).toThrow(/METRICS_TOKEN/);
  });

  it('rejects an empty METRICS_TOKEN in production', () => {
    expect(() => validateEnv({ ...prodBase, METRICS_TOKEN: '   ' })).toThrow(/METRICS_TOKEN/);
  });

  it('accepts a present METRICS_TOKEN in production', () => {
    expect(() => validateEnv({ ...prodBase, METRICS_TOKEN: 'a-real-metrics-token' })).not.toThrow();
  });

  it('does not require METRICS_TOKEN outside production', () => {
    expect(() => validateEnv({ NODE_ENV: 'development', JWT_SECRET: 'x' })).not.toThrow();
  });

  it('aggregates every failing secret into one error', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'short',
        WEBHOOK_HMAC_SECRET: 'your-webhook-hmac-secret',
        // ENCRYPTION_MASTER_KEY missing entirely
      }),
    ).toThrow(/JWT_SECRET[\s\S]*WEBHOOK_HMAC_SECRET[\s\S]*ENCRYPTION_MASTER_KEY/);
  });
});
